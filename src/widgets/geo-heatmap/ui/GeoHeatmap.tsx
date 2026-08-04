import { Alert, Box, LinearProgress, Slider, Stack, Typography } from "@mui/material";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import type { Color } from "@deck.gl/core";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { useDateRangeStore } from "@entities/date-range";
import { useGeoHeatmap, type GeoHeatPoint } from "@entities/analytics";
import { DateRangePicker } from "@features/date-range-picker";
import maplibregl, { type StyleSpecification } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  filterHeatPoints,
  getHeatStyle,
  HEAT_COLOR_RANGE,
} from "../model/heat-style";
import {
  selectRequestBounds,
  UZBEKISTAN_BOUNDS,
  type GeoBounds,
} from "../model/viewport";
import "maplibre-gl/dist/maplibre-gl.css";

const DEFAULT_MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  layers: [
    {
      id: "osm",
      type: "raster",
      source: "osm",
      paint: {
        "raster-saturation": -0.28,
        "raster-contrast": -0.08,
        "raster-brightness-max": 0.96,
      },
    },
  ],
};

const MAP_STYLE = import.meta.env.VITE_GEO_MAP_STYLE_URL || DEFAULT_MAP_STYLE;

function visibleBounds(map: maplibregl.Map): GeoBounds {
  const bounds = map.getBounds();
  return {
    west: Math.max(UZBEKISTAN_BOUNDS.west, bounds.getWest()),
    south: Math.max(UZBEKISTAN_BOUNDS.south, bounds.getSouth()),
    east: Math.min(UZBEKISTAN_BOUNDS.east, bounds.getEast()),
    north: Math.min(UZBEKISTAN_BOUNDS.north, bounds.getNorth()),
  };
}

function DensityLegend() {
  return (
    <Box
      sx={{
        position: "absolute",
        left: { xs: 12, sm: 20 },
        bottom: { xs: 18, sm: 24 },
        zIndex: 4,
        width: { xs: 184, sm: 220 },
        px: 1.75,
        py: 1.4,
        borderRadius: 3,
        color: "#3f291d",
        backgroundColor: "rgba(255,255,255,0.9)",
        backdropFilter: "blur(18px) saturate(155%)",
        border: "1px solid rgba(255,255,255,0.82)",
        boxShadow: "0 14px 38px rgba(74,39,16,0.16)",
        pointerEvents: "none",
      }}
    >
      <Typography variant="caption" fontWeight={750}>
        Client density
      </Typography>
      <Box
        sx={{
          height: 9,
          mt: 0.8,
          borderRadius: 99,
          background:
            "linear-gradient(90deg, rgba(255,234,0,0) 0%, #ffea00 22%, #ffc107 46%, #ff8000 68%, #f44336 84%, #c62828 100%)",
        }}
      />
      <Stack direction="row" justifyContent="space-between" mt={0.4}>
        <Typography variant="caption" color="text.secondary">
          Low
        </Typography>
        <Typography variant="caption" color="text.secondary">
          High
        </Typography>
      </Stack>
    </Box>
  );
}

export function GeoHeatmap() {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const successfulBoundsRef = useRef<GeoBounds | null>(null);
  const debounceRef = useRef<number | null>(null);
  const [requestBounds, setRequestBounds] = useState<GeoBounds>({
    ...UZBEKISTAN_BOUNDS,
  });
  const [zoom, setZoom] = useState(5);
  const [intensity, setIntensity] = useState(1);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const range = useDateRangeStore((state) => state.range);
  const query = useGeoHeatmap(requestBounds);
  const points = useMemo(
    () => filterHeatPoints(query.data?.points ?? []),
    [query.data?.points],
  );

  useEffect(() => {
    successfulBoundsRef.current = null;
  }, [range.from, range.to]);

  useEffect(() => {
    if (query.isSuccess && !query.isPlaceholderData) {
      successfulBoundsRef.current = requestBounds;
    }
  }, [query.isPlaceholderData, query.isSuccess, requestBounds]);

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) return;

    try {
      const map = new maplibregl.Map({
        container: mapElementRef.current,
        style: MAP_STYLE,
        center: [64.6, 41.35],
        zoom: 5,
        minZoom: 4.5,
        maxZoom: 18,
        maxBounds: [
          [54.9, 36.4],
          [74.2, 46.4],
        ],
        attributionControl: { compact: true },
        fadeDuration: 120,
      });
      const overlay = new MapboxOverlay({
        interleaved: false,
        layers: [],
      });

      mapRef.current = map;
      overlayRef.current = overlay;
      map.addControl(
        overlay as unknown as maplibregl.IControl,
      );
      map.addControl(
        new maplibregl.NavigationControl({ showCompass: false }),
        "bottom-right",
      );

      const scheduleViewportRequest = () => {
        if (debounceRef.current !== null) {
          window.clearTimeout(debounceRef.current);
        }
        debounceRef.current = window.setTimeout(() => {
          const next = selectRequestBounds(
            successfulBoundsRef.current,
            visibleBounds(map),
          );
          if (next) {
            setRequestBounds(next);
          }
        }, 300);
      };

      const updateZoom = () => setZoom(map.getZoom());
      map.on("load", () => {
        map.fitBounds(
          [
            [UZBEKISTAN_BOUNDS.west, UZBEKISTAN_BOUNDS.south],
            [UZBEKISTAN_BOUNDS.east, UZBEKISTAN_BOUNDS.north],
          ],
          { padding: 36, maxZoom: 6, animate: false },
        );
        updateZoom();
        setMapReady(true);
      });
      map.on("moveend", scheduleViewportRequest);
      map.on("zoomend", updateZoom);
    } catch (error) {
      setMapError(
        error instanceof Error ? error.message : "WebGL map initialization failed",
      );
    }

    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
      }
      overlayRef.current?.finalize();
      overlayRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const style = getHeatStyle(zoom);
    const colorRange: Color[] = HEAT_COLOR_RANGE.map(
      (color) => [...color] as [number, number, number, number],
    );

    overlay.setProps({
      layers: [
        new HeatmapLayer<GeoHeatPoint>({
          id: "geo-density",
          data: points,
          getPosition: (point) => [point[0], point[1]],
          getWeight: (point) => point[2],
          aggregation: "SUM",
          radiusPixels: style.radiusPixels,
          intensity: style.intensity * intensity,
          threshold: style.threshold,
          colorRange,
          weightsTextureSize: 1024,
          debounceTimeout: 350,
          pickable: false,
        }),
      ],
    });
  }, [intensity, points, zoom]);

  const firstLoad = query.isPending && !query.data;
  const showEmpty = mapReady && query.isSuccess && points.length === 0;

  return (
    <Box
      sx={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: 480,
        overflow: "hidden",
        backgroundColor: "#eee9df",
      }}
    >
      <Box
        ref={mapElementRef}
        aria-label="Client geolocation heatmap"
        style={{ position: "absolute", inset: 0 }}
      />

      {query.isFetching ? (
        <LinearProgress
          aria-label="Loading GEO data"
          sx={{ position: "absolute", zIndex: 6, top: 0, left: 0, right: 0 }}
        />
      ) : null}

      <Box
        sx={{
          position: "absolute",
          zIndex: 5,
          top: { xs: 12, sm: 20 },
          left: { xs: 12, sm: 20 },
          right: { xs: 12, sm: "auto" },
          width: { sm: 300 },
          p: 1.75,
          borderRadius: 3.5,
          backgroundColor: "rgba(255,255,255,0.9)",
          backdropFilter: "blur(20px) saturate(160%)",
          border: "1px solid rgba(255,255,255,0.84)",
          boxShadow: "0 16px 42px rgba(74,39,16,0.16)",
        }}
      >
        <Stack spacing={1.5}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Stack direction="row" spacing={0.8} alignItems="center">
              <TuneRoundedIcon sx={{ fontSize: 18, color: "#f4511e" }} />
              <Typography variant="subtitle2" fontWeight={750}>
                Heatmap controls
              </Typography>
            </Stack>
            <DateRangePicker />
          </Stack>
          <Box>
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="caption" color="text.secondary">
                Intensity
              </Typography>
              <Typography variant="caption" fontWeight={700}>
                {intensity.toFixed(1)}×
              </Typography>
            </Stack>
            <Slider
              size="small"
              value={intensity}
              onChange={(_, value) => setIntensity(value as number)}
              min={0.5}
              max={2.5}
              step={0.1}
              aria-label="Heatmap intensity"
              sx={{
                color: "#f4511e",
                py: 0.8,
                "& .MuiSlider-thumb": { boxShadow: "0 2px 8px rgba(244,81,30,.3)" },
              }}
            />
          </Box>
        </Stack>
      </Box>

      <DensityLegend />

      {firstLoad ? (
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            zIndex: 3,
            display: "grid",
            placeItems: "center",
            pointerEvents: "none",
          }}
        >
          <Box
            sx={{
              px: 2.2,
              py: 1.2,
              borderRadius: 99,
              backgroundColor: "rgba(255,255,255,0.9)",
              boxShadow: "0 10px 28px rgba(74,39,16,0.13)",
            }}
          >
            <Typography variant="body2" fontWeight={650}>
              Loading client density…
            </Typography>
          </Box>
        </Box>
      ) : null}

      {showEmpty ? (
        <Box
          sx={{
            position: "absolute",
            zIndex: 3,
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            maxWidth: 360,
            px: 3,
            py: 2.25,
            textAlign: "center",
            borderRadius: 4,
            backgroundColor: "rgba(255,255,255,0.92)",
            boxShadow: "0 18px 48px rgba(74,39,16,0.14)",
          }}
        >
          <Typography variant="subtitle1" fontWeight={750}>
            No locations in this view
          </Typography>
          <Typography variant="body2" color="text.secondary" mt={0.5}>
            Try a wider date range or move to another area.
          </Typography>
        </Box>
      ) : null}

      {query.error || mapError ? (
        <Alert
          severity="error"
          sx={{
            position: "absolute",
            zIndex: 7,
            right: { xs: 12, sm: 20 },
            top: { xs: 180, sm: 20 },
            maxWidth: 420,
            boxShadow: "0 12px 32px rgba(74,39,16,0.16)",
          }}
        >
          {mapError ?? (query.error as Error).message}
        </Alert>
      ) : null}
    </Box>
  );
}
