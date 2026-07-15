import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadCoordinator() {
  const source = await readFile(
    new URL("../src/widgets/sidebar/model/navigation-coordinator.ts", import.meta.url),
    "utf8",
  );
  const javascript = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const flushQueue = () => new Promise((resolve) => setImmediate(resolve));

test("rapid navigation is serialized, latest-wins, and ignores a duplicate pending target", async () => {
  const { NavigationCoordinator } = await loadCoordinator();
  const cancellations = [];
  const navigated = [];
  const coordinator = new NavigationCoordinator(
    () => {
      const cancellation = deferred();
      cancellations.push(cancellation);
      return cancellation.promise;
    },
    (destination) => navigated.push(destination),
  );

  const first = coordinator.request("/campaigns");
  await flushQueue();
  const second = coordinator.request("/performance");
  const duplicate = coordinator.request("/performance");

  assert.equal(duplicate, null);
  assert.equal(cancellations.length, 1);

  cancellations[0].resolve();
  await first;
  await flushQueue();
  assert.deepEqual(navigated, []);
  assert.equal(cancellations.length, 2);

  cancellations[1].resolve();
  await second;
  assert.deepEqual(navigated, ["/performance"]);
});

test("clicking the current route overrides a pending destination and refreshes it", async () => {
  const { NavigationCoordinator } = await loadCoordinator();
  const cancellations = [];
  const navigated = [];
  let refreshes = 0;
  const coordinator = new NavigationCoordinator(
    () => {
      const cancellation = deferred();
      cancellations.push(cancellation);
      return cancellation.promise;
    },
    (destination) => navigated.push(destination),
    async () => {
      refreshes += 1;
    },
  );

  const pending = coordinator.request("/campaigns", "/");
  await flushQueue();
  const stayCurrent = coordinator.request("/", "/");

  cancellations[0].resolve();
  await pending;
  await flushQueue();
  assert.deepEqual(navigated, []);

  cancellations[1].resolve();
  await stayCurrent;
  assert.deepEqual(navigated, ["/"]);
  assert.equal(refreshes, 1);
});

test("clicking the current route is a no-op when no destination is pending", async () => {
  const { NavigationCoordinator } = await loadCoordinator();
  let cancellations = 0;
  let navigations = 0;
  let refreshes = 0;
  const coordinator = new NavigationCoordinator(
    async () => {
      cancellations += 1;
    },
    () => {
      navigations += 1;
    },
    async () => {
      refreshes += 1;
    },
  );

  const request = coordinator.request("/", "/");

  assert.equal(request, null);
  assert.equal(cancellations, 0);
  assert.equal(navigations, 0);
  assert.equal(refreshes, 0);
});
