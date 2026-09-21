import { useCallback, useEffect, useState } from "react";

import { getLocation, getUserDevices, type GlpiDevice, type GlpiLocation } from "./api";
import { getSessionUser } from "./auth";

export type LiveState = "idle" | "loading" | "ready" | "error" | "signed-out";

export interface LiveDevices {
  devices: GlpiDevice[];
  state: LiveState;
  error: string | null;
  reload: () => void;
}

/**
 * Loads the signed-in member's GLPI Phone assets.
 *
 * Client-only on purpose: the session lives in localStorage, so there is nothing
 * to read during SSR. Every consumer must handle the signed-out, loading, empty
 * and error states - none of them should blank the page.
 */
export function useLiveDevices(): LiveDevices {
  const [devices, setDevices] = useState<GlpiDevice[]>([]);
  const [state, setState] = useState<LiveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    const user = getSessionUser();

    if (!user) {
      setState("signed-out");
      setDevices([]);
      return;
    }

    setState("loading");
    setError(null);

    getUserDevices(user.id)
      .then((list) => {
        if (cancelled) return;
        setDevices(list);
        setState("ready");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setDevices([]);
        setError(e instanceof Error ? e.message : "Could not load assigned devices.");
        setState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return { devices, state, error, reload };
}

/** Human label for a device: real GLPI name plus its BTDS inventory tag. */
export function deviceLabel(device: GlpiDevice): string {
  return device.assetTag ? `${device.name} · ${device.assetTag}` : device.name;
}

/* ------------------------------------------------------------------ */
/* Row adapters for the staff tables                                   */
/*                                                                     */
/* The backend exposes only GET /api/devices/:userId - there is no      */
/* fleet-wide endpoint yet - so the staff tables show live rows for the */
/* signed-in member's assets and keep the sample fleet alongside them.  */
/* `source` marks which is which; fields with no GLPI equivalent are    */
/* null on live rows rather than invented.                              */
/* ------------------------------------------------------------------ */
export interface DeviceRow {
  source: "live" | "sample";
  glpiId: number | null;
  /** BTDS inventory tag on live rows. */
  tag: string;
  name: string;
  model: string;
  type: string;
  unit: string;
  /** GLPI State ("In use", "In repair", ...) on live rows. */
  status: string | null;
  locationId: number | null;
  latitude: string | null;
  longitude: string | null;
  /* Mock-only telemetry: no backend equivalent exists yet. */
  borough: string | null;
  carrier: string | null;
  health: string | null;
  battery: number | null;
  lastCheckIn: string | null;
  osVersion: string | null;
}

export function toDeviceRow(d: GlpiDevice): DeviceRow {
  return {
    source: "live",
    glpiId: d.id,
    tag: d.assetTag ?? d.name,
    name: d.name,
    model: d.model ?? "—",
    type: d.type ?? "Phone",
    unit: d.locationName ?? d.unit ?? "—",
    status: d.status ?? null,
    locationId: d.locationId ?? null,
    latitude: d.latitude ?? null,
    longitude: d.longitude ?? null,
    borough: null,
    carrier: null,
    health: null,
    battery: null,
    lastCheckIn: null,
    osVersion: null,
  };
}

/** Wraps an existing mock fleet record so both sources share one row shape. */
export function toSampleRow(d: {
  tag: string;
  model: string;
  type: string;
  unit: string;
  borough: string;
  carrier: string;
  health: string;
  battery: number;
  lastCheckIn: string;
  osVersion: string;
}): DeviceRow {
  return {
    source: "sample",
    glpiId: null,
    tag: d.tag,
    name: d.tag,
    model: d.model,
    type: d.type,
    unit: d.unit,
    status: null,
    locationId: null,
    latitude: null,
    longitude: null,
    borough: d.borough,
    carrier: d.carrier,
    health: d.health,
    battery: d.battery,
    lastCheckIn: d.lastCheckIn,
    osVersion: d.osVersion,
  };
}

/**
 * Fetches authoritative location detail (name, address, seeded GPS) for a GLPI
 * location id via GET /api/location/:locationId. Returns null while loading,
 * when there is no id, or when the lookup fails - callers fall back to the
 * location fields already embedded in the device record.
 */
export function useLiveLocation(locationId: number | null) {
  const [location, setLocation] = useState<GlpiLocation | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLocation(null);
    if (!locationId) return;

    getLocation(locationId)
      .then((l) => {
        if (!cancelled) setLocation(l);
      })
      .catch(() => {
        if (!cancelled) setLocation(null);
      });

    return () => {
      cancelled = true;
    };
  }, [locationId]);

  return location;
}
