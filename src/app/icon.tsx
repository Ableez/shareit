import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #18181b 0%, #3f3f46 100%)",
          color: "white",
          fontSize: 240,
          fontWeight: 700,
          letterSpacing: -16,
          borderRadius: 96,
        }}
      >
        S
      </div>
    ),
    { ...size },
  );
}
