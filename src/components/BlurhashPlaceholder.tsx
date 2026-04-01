import { useRef, useEffect, useState } from "react";
import { decode } from "blurhash";

export interface BlurhashPlaceholderProps {
  blurhash: string;
  /** Explicit width. Omit (or pass undefined) to inherit from className/parent. */
  width?: number;
  /** Explicit height. Omit (or pass undefined) to inherit from className/parent. */
  height?: number;
  /** When provided, crossfade to real image once loaded. */
  src?: string;
  alt?: string;
  className?: string;
  /** Use "cover" to crop-fill or "contain" to fit without cropping. */
  objectFit?: "cover" | "contain";
}

// Module-level cache of successfully loaded image URLs
const loadedImages = new Set<string>();

const DECODE_WIDTH = 32;
const DECODE_HEIGHT = 32;

export function BlurhashPlaceholder({
  blurhash,
  width,
  height,
  src,
  alt = "",
  className = "",
  objectFit = "cover",
}: BlurhashPlaceholderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imageLoaded, setImageLoaded] = useState(() =>
    src ? loadedImages.has(src) : false
  );
  const [decodeFailed, setDecodeFailed] = useState(false);

  // Decode blurhash and paint to canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !blurhash) {
      setDecodeFailed(true);
      return;
    }

    try {
      const pixels = decode(blurhash, DECODE_WIDTH, DECODE_HEIGHT);
      canvas.width = DECODE_WIDTH;
      canvas.height = DECODE_HEIGHT;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setDecodeFailed(true);
        return;
      }
      const imageData = ctx.createImageData(DECODE_WIDTH, DECODE_HEIGHT);
      imageData.data.set(pixels);
      ctx.putImageData(imageData, 0, 0);
      setDecodeFailed(false);
    } catch {
      setDecodeFailed(true);
    }
  }, [blurhash]);

  // Reset loaded state when src changes (check cache first)
  useEffect(() => {
    setImageLoaded(src ? loadedImages.has(src) : false);
  }, [src]);

  // Fallback: empty/invalid blurhash
  if (!blurhash || decodeFailed) {
    return (
      <div
        className={`bg-elevated ${className}`}
        style={{ width: width ?? undefined, height: height ?? undefined }}
        role="img"
        aria-label={alt}
      />
    );
  }

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ width: width ?? undefined, height: height ?? undefined }}
      role="img"
      aria-label={alt}
    >
      {/* Blurhash canvas — fades out when real image loads */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full object-cover transition-opacity duration-300"
        style={{ opacity: imageLoaded ? 0 : 1 }}
      />

      {/* Real image — fades in once loaded */}
      {src && (
        <img
          src={src}
          alt={alt}
          className={`absolute inset-0 h-full w-full transition-opacity duration-300 ${
            objectFit === "contain" ? "object-contain" : "object-cover"
          }`}
          style={{ opacity: imageLoaded ? 1 : 0 }}
          onLoad={() => {
            if (src) loadedImages.add(src);
            setImageLoaded(true);
          }}
          onError={() => setImageLoaded(false)}
        />
      )}
    </div>
  );
}
