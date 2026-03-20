export interface CargoItem {
  id?: number | null
  commodityName?: string | null
  quantity?: number
  delivered?: number
  crateSizeMax?: number | null
  action?: 'load' | 'unload'
  pickupPoiId?: number | null
  dropoffPoiId?: number | null
  pickupPoiName?: string | null
  dropoffPoiName?: string | null
  pickupSystemName?: string | null
  dropoffSystemName?: string | null
  buyPrice?: number | null
  sellPrice?: number | null
}

export interface ManifestItem {
  id?: number
  pickup?: number | null
  pickupName?: string | null
  pickupSystemName?: string | null
  dropoff?: number | null
  dropoffName?: string | null
  dropoffSystemName?: string | null
  commodityId?: number | null
  commodityName?: string | null
  quantity?: number
  crateSizeMax?: number | null
}

export interface ItineraryLine {
  legId?: string | number
  pickup?: number | null
  pickupName?: string | null
  pickupSystemName?: string | null
  dropoff?: number | null
  dropoffName?: string | null
  dropoffSystemName?: string | null
  completed?: boolean
  orderIndex?: number
  status?: string | null
  cargos?: CargoItem[]
}

export interface TransportOrder {
  id: number
  name?: string
  cargoTot?: number
  origin?: number | null
  originName?: string | null
  originSystemName?: string | null
  startingCredits?: number
  autoFillCargo?: boolean
  shipsCount?: number
  ships?: Array<{ shipId?: string; shipName?: string; note?: string }>
  manifests?: ManifestItem[]
  itinerary?: {
    id?: number
    name?: string
    generatedAt?: string
    obsolete?: boolean
    lines?: ItineraryLine[]
  }
}
