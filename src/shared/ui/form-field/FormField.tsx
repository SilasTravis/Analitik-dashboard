import { TextField } from "@mui/material";
import type { TextFieldProps } from "@mui/material";

export function FormField(props: TextFieldProps) {
  return (
    <TextField
      variant="standard"
      fullWidth
      size="medium"
      {...props}
      sx={{
        "& .MuiOutlinedInput-root": { borderRadius: 2 },
        ...props.sx,
      }}
    />
  );
}
