import { useLiveQuery } from 'dexie-react-hooks'
import { DEFAULT_SETTINGS, db, getSettings } from '../db'
import { buildTimeline, latestOdometer, listFuelTypes, listVehicles } from '../db/repo'

/** Reactive reads straight from IndexedDB — no copy of the data is kept in a client store. */

export function useVehicles() {
  return useLiveQuery(() => listVehicles(), [], undefined)
}

export function useSettings() {
  return useLiveQuery(() => getSettings(), [], DEFAULT_SETTINGS)
}

export function useActiveVehicle() {
  return useLiveQuery(
    async () => {
      const [settings, vehicles] = await Promise.all([getSettings(), listVehicles()])
      if (!vehicles.length) return null
      return vehicles.find((v) => v.id === settings.active_vehicle_id) ?? vehicles[0] ?? null
    },
    [],
    undefined,
  )
}

export function useTimeline(vehicleId: string | undefined) {
  return useLiveQuery(
    async () => (vehicleId ? buildTimeline(vehicleId) : []),
    [vehicleId],
    undefined,
  )
}

export function useLatestOdometer(vehicleId: string | undefined) {
  return useLiveQuery(
    async () => (vehicleId ? latestOdometer(vehicleId) : null),
    [vehicleId],
    null,
  )
}

export function useCounts() {
  return useLiveQuery(
    async () => ({
      vehicles: await db.vehicles.count(),
      fuel: await db.fuelEntries.count(),
      services: await db.services.count(),
      expenses: await db.expenses.count(),
    }),
    [],
    undefined,
  )
}

export function useFuelTypes() {
  return useLiveQuery(() => listFuelTypes(), [], undefined)
}

/** Types offered in the pickers: everything the user has not archived. */
export function useActiveFuelTypes() {
  return useLiveQuery(async () => (await listFuelTypes()).filter((f) => !f.archived), [], undefined)
}
