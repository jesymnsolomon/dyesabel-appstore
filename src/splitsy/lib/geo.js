/** Gets the phone's position (asks permission the first time). */
export function getPosition(timeout = 9000) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Location not supported'))
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout, maximumAge: 60000 },
    )
  })
}

const VENUE_LABELS = {
  restaurant: 'Restaurant', fast_food: 'Restaurant', food_court: 'Food Court', cafe: 'Café', bar: 'Bar', pub: 'Pub',
  ice_cream: 'Ice Cream Shop', bakery: 'Bakery', supermarket: 'Supermarket', convenience: 'Convenience Store',
  mall: 'Mall', department_store: 'Department Store', clothes: 'Clothing Store', shoes: 'Shoe Store',
  hotel: 'Hotel', hostel: 'Hostel', guest_house: 'Guest House', resort: 'Resort', cinema: 'Cinema',
  fuel: 'Gas Station', pharmacy: 'Pharmacy', hospital: 'Hospital', clinic: 'Clinic', hairdresser: 'Salon',
  beauty: 'Salon', gym: 'Gym', fitness_centre: 'Gym', bus_station: 'Bus Station', aerodrome: 'Airport',
  terminal: 'Terminal', parking: 'Parking', marketplace: 'Market', museum: 'Museum', park: 'Park', attraction: 'Attraction',
}

const VENUE_CATEGORY = {
  Restaurant: 'Food', 'Food Court': 'Food', Café: 'Drinks', Bar: 'Drinks', Pub: 'Drinks', 'Ice Cream Shop': 'Food',
  Bakery: 'Food', Supermarket: 'Groceries', 'Convenience Store': 'Groceries', Market: 'Groceries', Mall: 'Shopping',
  'Department Store': 'Shopping', 'Clothing Store': 'Clothing', 'Shoe Store': 'Clothing', Hotel: 'Stay', Hostel: 'Stay',
  'Guest House': 'Stay', Resort: 'Stay', Cinema: 'Fun', Museum: 'Fun', Park: 'Fun', Attraction: 'Fun',
  'Gas Station': 'Transport', Parking: 'Transport', 'Bus Station': 'Transport', Airport: 'Travel', Terminal: 'Travel',
  Pharmacy: 'Health', Hospital: 'Health', Clinic: 'Health', Salon: 'Service', Gym: 'Service',
}

/** Turns coordinates into a friendly place name using OpenStreetMap (free, no key). */
export async function reverseGeocode({ lat, lng }) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&accept-language=en&lat=${lat}&lon=${lng}`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error('Could not look up place')
  const j = await res.json()
  const a = j.address || {}
  const area = a.suburb || a.neighbourhood || a.village || a.quarter || a.city_district
  const city = a.city || a.town || a.municipality || a.county
  const venue = VENUE_LABELS[j.type] || null
  const poi = j.name && j.name !== a.road ? j.name : null
  const short = poi || [a.road, area].filter(Boolean).join(', ') || city || 'Somewhere nice'
  return {
    lat, lng,
    name: short,
    poi,
    venue,
    venueCategory: venue ? VENUE_CATEGORY[venue] : null,
    address: [a.road, area, city].filter(Boolean).join(', ') || j.display_name,
  }
}

/** One-shot helper: position + place name. Never throws; returns null on failure. */
export async function detectPlace() {
  try {
    const pos = await getPosition()
    try {
      return await reverseGeocode(pos)
    } catch {
      return { ...pos, name: 'Pinned location', address: `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}` }
    }
  } catch {
    return null
  }
}

export const mapsLink = (lat, lng) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
