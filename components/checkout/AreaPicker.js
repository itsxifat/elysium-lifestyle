"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// District and thana pickers, from the lists couriers deliver by (the brand
// ERP's geography, through /api/geo/*). Shared by the checkout and the account's
// address book. Lists are cached for the page's life.

let districtsPromise = null;
const thanaCache = new Map();

function loadDistricts() {
  if (!districtsPromise) {
    districtsPromise = fetch("/api/geo/districts")
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => d.items || [])
      .catch(() => {
        districtsPromise = null;
        return [];
      });
  }
  return districtsPromise;
}

function loadThanas(districtId) {
  const key = String(districtId);
  if (!thanaCache.has(key)) {
    thanaCache.set(
      key,
      fetch(`/api/geo/thanas?districtId=${encodeURIComponent(key)}`)
        .then((r) => (r.ok ? r.json() : { items: [] }))
        .then((d) => d.items || [])
        .catch(() => {
          thanaCache.delete(key);
          return [];
        })
    );
  }
  return thanaCache.get(key);
}

export function useDistricts() {
  const [districts, setDistricts] = useState([]);
  useEffect(() => {
    let active = true;
    loadDistricts().then((d) => { if (active) setDistricts(d); });
    return () => { active = false; };
  }, []);
  return districts;
}

export function useThanas(districtId) {
  const [thanas, setThanas] = useState([]);
  useEffect(() => {
    if (!districtId) { setThanas([]); return; }
    let active = true;
    loadThanas(districtId).then((t) => { if (active) setThanas(t); });
    return () => { active = false; };
  }, [districtId]);
  return thanas;
}

const selectClass =
  "w-full border border-brand-tan bg-white px-4 py-3 text-sm text-brand-brown focus:outline-none focus:border-brand-terracotta transition-colors";

/**
 * Two selects. `value` is `{ districtId, thanaId }` (numbers or ""), `onChange`
 * gets the next value; choosing a district clears the thana.
 */
export default function AreaPicker({ value, onChange, errors = {}, className, idPrefix = "area" }) {
  const districts = useDistricts();
  const thanas = useThanas(value?.districtId);
  return (
    <div className={cn("grid grid-cols-1 sm:grid-cols-2 gap-4", className)}>
      <div className="w-full">
        <label htmlFor={`${idPrefix}-district`} className="block text-sm font-medium text-brand-brown mb-1">
          District *
        </label>
        <select
          id={`${idPrefix}-district`}
          value={value?.districtId || ""}
          onChange={(e) => onChange({ districtId: e.target.value ? Number(e.target.value) : "", thanaId: "" })}
          className={cn(selectClass, errors.districtId && "border-red-500")}
        >
          <option value="">Choose a district</option>
          {districts.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        {errors.districtId && <p className="mt-1 text-xs text-red-500">{errors.districtId}</p>}
      </div>
      <div className="w-full">
        <label htmlFor={`${idPrefix}-thana`} className="block text-sm font-medium text-brand-brown mb-1">
          Thana / Upazila *
        </label>
        <select
          id={`${idPrefix}-thana`}
          value={value?.thanaId || ""}
          disabled={!value?.districtId}
          onChange={(e) => onChange({ districtId: value.districtId, thanaId: e.target.value ? Number(e.target.value) : "" })}
          className={cn(selectClass, "disabled:opacity-50", errors.thanaId && "border-red-500")}
        >
          <option value="">{value?.districtId ? "Choose a thana" : "Choose a district first"}</option>
          {thanas.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        {errors.thanaId ? (
          <p className="mt-1 text-xs text-red-500">{errors.thanaId}</p>
        ) : (
          // The courier lists name upazilas, not city neighbourhoods.
          <p className="mt-1 text-[11px] text-brand-tan">In a city? Choose the nearest one and write your area below.</p>
        )}
      </div>
    </div>
  );
}
