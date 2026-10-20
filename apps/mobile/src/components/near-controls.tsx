import { lookupPlace, tokens } from "@fyh/shared";
import * as Location from "expo-location";
import { useState } from "react";
import { Text, View } from "react-native";
import { env } from "@/lib/supabase";
import { Button, Field, Notice, Segmented, text } from "./ui";

const { spacing } = tokens;

export interface NearPlace {
  lat: number;
  lng: number;
  label: string;
}

/** "Near me" (phone location, asked only when tapped) or "near a place" (OpenStreetMap lookup). */
export function NearControls({
  value,
  radius,
  radiusOptions,
  onChange,
  onRadiusChange,
}: {
  value: NearPlace | null;
  radius: number;
  radiusOptions: number[];
  onChange: (place: NearPlace | null) => void;
  onRadiusChange: (km: number) => void;
}) {
  const [place, setPlace] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function nearMe() {
    setBusy(true);
    setMessage(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        setMessage("Location permission was not given. Type a place, locality or PIN code instead.");
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      onChange({ lat: Math.round(position.coords.latitude * 1000) / 1000, lng: Math.round(position.coords.longitude * 1000) / 1000, label: "My location" });
    } catch {
      setMessage("Couldn't get your location. Type a place instead.");
    } finally {
      setBusy(false);
    }
  }

  async function findPlace() {
    const typed = place.trim();
    if (typed.length < 2) return;
    setBusy(true);
    setMessage(null);
    try {
      const found = await lookupPlace(env.supabaseUrl, env.supabasePublishableKey, typed);
      if (found) onChange({ ...found, label: typed });
      else setMessage(`We couldn't find “${typed}”. Try a locality, landmark or PIN code.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Location search is busy.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: spacing.sm }}>
      {value ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <Text style={[text.body, { flex: 1 }]}>Near: {value.label}</Text>
          <Button label="Clear" variant="ghost" onPress={() => onChange(null)} />
        </View>
      ) : null}
      <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "flex-end" }}>
        <View style={{ flex: 1 }}>
          <Field label="Near a place" value={place} onChangeText={setPlace} placeholder="Locality, landmark or PIN" returnKeyType="search" onSubmitEditing={findPlace} />
        </View>
        <Button label="Find" variant="secondary" loading={busy} onPress={findPlace} />
      </View>
      <Button label="Use my location" variant="secondary" loading={busy} onPress={nearMe} />
      <Segmented
        label="Distance"
        value={String(radius)}
        options={radiusOptions.map((km) => ({ value: String(km), label: `${km} km` }))}
        onChange={(km) => onRadiusChange(Number(km) || radius)}
      />
      {message ? <Notice tone="warning">{message}</Notice> : null}
      <Text style={text.muted}>Places found with OpenStreetMap.</Text>
    </View>
  );
}
