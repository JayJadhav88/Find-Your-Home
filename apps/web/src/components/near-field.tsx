"use client";

import { lookupPlace } from "@fyh/shared";
import { useEffect, useRef, useState } from "react";
import { env } from "@/lib/env";
import { Button, Select, TextInput } from "./ui";

/**
 * "Near me" or "near a place" for the search form. Typing a place and submitting looks it up
 * (OpenStreetMap, cached) and fills the hidden coordinates first; "Use my location" asks the
 * browser. Search still works without either.
 */
export function NearField({
  radiusOptions,
  initial,
}: {
  radiusOptions: number[];
  initial: { lat?: number; lng?: number; radius?: number; near?: string };
}) {
  const [place, setPlace] = useState(initial.near ?? "");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    initial.lat !== undefined && initial.lng !== undefined ? { lat: initial.lat, lng: initial.lng } : null,
  );
  const [resolvedFor, setResolvedFor] = useState(initial.near ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  // Look the place up before the surrounding form submits.
  useEffect(() => {
    const form = wrapper.current?.closest("form");
    if (!form) return;
    async function onSubmit(event: SubmitEvent) {
      const typed = (form!.elements.namedItem("near") as HTMLInputElement | null)?.value.trim() ?? "";
      if (!typed || typed === resolvedFor || typed === "My location") return;
      event.preventDefault();
      setBusy(true);
      setMessage(null);
      try {
        const found = await lookupPlace(env.supabaseUrl, env.supabasePublishableKey, typed);
        if (!found) {
          setMessage(`We couldn't find “${typed}”. Try a locality, landmark or PIN code.`);
          return;
        }
        setCoords({ lat: found.lat, lng: found.lng });
        setResolvedFor(typed);
        // Wait for React to write the hidden inputs, then submit for real.
        requestAnimationFrame(() => form!.requestSubmit());
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Location search is busy.");
      } finally {
        setBusy(false);
      }
    }
    form.addEventListener("submit", onSubmit);
    return () => form.removeEventListener("submit", onSubmit);
  }, [resolvedFor]);

  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      setMessage("This browser can't share its location. Type a place instead.");
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ lat: Math.round(position.coords.latitude * 1000) / 1000, lng: Math.round(position.coords.longitude * 1000) / 1000 });
        setPlace("My location");
        setResolvedFor("My location");
        setMessage(null);
        setBusy(false);
      },
      () => {
        setMessage("Location permission was denied. Type a place, locality or PIN code instead.");
        setBusy(false);
      },
      { maximumAge: 300_000, timeout: 10_000 },
    );
  }

  const active = coords && place.trim() !== "" && place.trim() === resolvedFor;

  return (
    <div ref={wrapper} className="flex flex-col gap-1">
      <label className="flex flex-col gap-1 text-sm font-medium">
        Near
        <TextInput bare name="near" value={place} onChange={(event) => setPlace(event.target.value)} placeholder="Locality, landmark or PIN code" maxLength={120} />
      </label>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Select name="radius" aria-label="Distance" defaultValue={String(initial.radius ?? radiusOptions[1] ?? radiusOptions[0] ?? 10)}>
          {radiusOptions.map((km) => (
            <option key={km} value={km}>Within {km} km</option>
          ))}
        </Select>
        <Button type="button" variant="secondary" onClick={useMyLocation} disabled={busy}>
          {busy ? "…" : "Use my location"}
        </Button>
      </div>
      {active ? (
        <>
          <input type="hidden" name="lat" value={coords.lat} />
          <input type="hidden" name="lng" value={coords.lng} />
        </>
      ) : null}
      {message ? <p className="text-xs text-danger" role="alert">{message}</p> : null}
      <p className="text-xs text-text-muted">Places found with OpenStreetMap.</p>
    </div>
  );
}
