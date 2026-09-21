import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";

/**
 * Map for a device's last-known position.
 *
 * The marker is placed at the coordinates GLPI holds for the asset's assigned
 * location - this component never derives or adjusts a position. It uses the
 * OpenStreetMap embed, so there is no API key, no paid tile service and no new
 * dependency.
 *
 * The frame stays mounted whenever GLPI has coordinates: it used to be removed
 * after a short timeout, but the frame was also lazy-loaded, so a map that was
 * still below the fold in the chat never reported a load and was discarded
 * before it could draw. A slow or blocked network now only adds a note, and the
 * location card below always carries the same information.
 */
export interface DeviceMapProps {
  latitude: string;
  longitude: string;
  label: string;
  locationName?: string | null;
  address?: string | null;
  accuracyMetres?: number | null;
}

export function DeviceMap({
  latitude,
  longitude,
  label,
  locationName,
  address,
  accuracyMetres,
}: DeviceMapProps) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  const usable = Number.isFinite(lat) && Number.isFinite(lon);

  const [tilesOk, setTilesOk] = useState<boolean | null>(usable ? null : false);
  const loaded = useRef(false);

  useEffect(() => {
    if (!usable) return;
    // Only notes that the tiles have not arrived; the frame is left in place so
    // a late load still draws.
    const timer = setTimeout(() => {
      if (!loaded.current) setTilesOk(false);
    }, 10000);
    return () => clearTimeout(timer);
  }, [usable]);

  // A small bounding box around the point keeps the marker centred.
  const pad = 0.004;
  const bbox = [lon - pad, lat - pad / 2, lon + pad, lat + pad / 2].join("%2C");
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lon}`;

  return (
    <div className="mt-3 overflow-hidden rounded-lg border">
      {usable ? (
        <iframe
          title={`Last known location of ${label}`}
          src={src}
          className="h-56 w-full border-0"
          referrerPolicy="no-referrer"
          onLoad={() => {
            loaded.current = true;
            setTilesOk(true);
          }}
          onError={() => setTilesOk(false)}
        />
      ) : null}

      {/* Always present, so the position is readable with or without tiles. */}
      <div className="bg-muted/40 px-3 py-2 text-xs">
        <p className="flex items-center gap-1.5 font-semibold">
          <MapPin className="size-3.5" /> {label}
        </p>
        {locationName ? <p className="mt-0.5">{locationName}</p> : null}
        {address ? <p className="text-muted-foreground">{address}</p> : null}
        <p className="mt-0.5 font-mono text-muted-foreground">
          {usable ? `${lat.toFixed(6)}, ${lon.toFixed(6)}` : "No coordinates recorded in GLPI"}
        </p>
        <p className="mt-1 text-muted-foreground">
          Position from the asset&rsquo;s GLPI location
          {accuracyMetres ? ` · simulated accuracy ±${accuracyMetres} m` : ""}
          {tilesOk === false && usable ? " · map tiles are still loading or unreachable" : ""}
        </p>
      </div>
    </div>
  );
}
