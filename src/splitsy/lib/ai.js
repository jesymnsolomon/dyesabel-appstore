/**
 * On-device photo identifier. Uses MobileNet (TensorFlow.js) — runs in the
 * browser, free, no API key. The model (~4 MB) is downloaded only the first
 * time someone scans a photo, then cached by the browser.
 */

let modelPromise = null

export function warmUpModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      const tf = await import('@tensorflow/tfjs')
      await tf.ready()
      const mobilenet = await import('@tensorflow-models/mobilenet')
      return mobilenet.load({ version: 2, alpha: 1.0 })
    })().catch((e) => {
      modelPromise = null
      throw e
    })
  }
  return modelPromise
}

// [pattern on ImageNet class name, category, friendly title (optional), isVenue]
const RULES = [
  // places / venues
  [/restaurant|eating house/, 'Food', 'Restaurant', true],
  [/grocery store|grocery|supermarket/, 'Groceries', 'Grocery Store', true],
  [/bakery|bakeshop/, 'Food', 'Bakery', true],
  [/butcher shop/, 'Groceries', 'Meat Shop', true],
  [/confectionery|candy store/, 'Food', 'Candy Store', true],
  [/barbershop/, 'Service', 'Barbershop', true],
  [/bookshop|bookstore/, 'Shopping', 'Bookstore', true],
  [/shoe shop/, 'Clothing', 'Shoe Store', true],
  [/toyshop/, 'Shopping', 'Toy Store', true],
  [/cinema|movie theater|theater curtain/, 'Fun', 'Cinema', true],
  [/tobacco shop/, 'Shopping', 'Shop', true],
  [/boathouse|dock/, 'Travel', 'Pier', true],
  [/four-poster|quilt|studio couch/, 'Stay', 'Hotel Room'],
  // food
  [/pizza/, 'Food', 'Pizza'], [/cheeseburger/, 'Food', 'Burger'], [/hotdog|hot dog/, 'Food', 'Hotdog'],
  [/carbonara/, 'Food', 'Pasta'], [/consomme/, 'Food', 'Soup'], [/hot pot/, 'Food', 'Hot Pot'],
  [/burrito/, 'Food', 'Burrito'], [/bagel/, 'Food', 'Bagel'], [/pretzel/, 'Food', 'Pretzel'],
  [/french loaf/, 'Food', 'Bread'], [/guacamole/, 'Food', 'Guacamole'], [/trifle/, 'Food', 'Dessert'],
  [/ice cream|ice lolly/, 'Food', 'Ice Cream'], [/meat loaf/, 'Food', 'Meat Loaf'], [/potpie/, 'Food', 'Pot Pie'],
  [/mashed potato/, 'Food', 'Mashed Potato'], [/chocolate sauce/, 'Food', 'Dessert'], [/dough/, 'Food', 'Pastry'],
  [/plate|soup bowl|menu|wok|frying pan|dutch oven|tray/, 'Food', 'Meal'],
  [/banana|strawberry|orange|lemon|pineapple|granny smith|fig|pomegranate|jackfruit|custard apple|broccoli|cauliflower|cabbage|cucumber|bell pepper|mushroom|zucchini|corn/, 'Groceries'],
  // drinks
  [/espresso|coffee mug|coffeepot|cup/, 'Drinks', 'Coffee'], [/beer bottle|beer glass/, 'Drinks', 'Beer'],
  [/red wine|wine bottle/, 'Drinks', 'Wine'], [/pop bottle|water bottle|water jug/, 'Drinks', 'Drinks'],
  [/teapot/, 'Drinks', 'Tea'], [/cocktail shaker|eggnog/, 'Drinks', 'Cocktails'],
  // clothing
  [/jersey|t-shirt/, 'Clothing', 'Shirt'], [/sweatshirt/, 'Clothing', 'Hoodie'], [/cardigan/, 'Clothing', 'Cardigan'],
  [/\bjean|blue jean|denim/, 'Clothing', 'Jeans'], [/miniskirt|overskirt|hoopskirt/, 'Clothing', 'Skirt'],
  [/\bsuit\b/, 'Clothing', 'Suit'], [/trench coat|fur coat|poncho|cloak/, 'Clothing', 'Jacket'],
  [/gown|kimono|abaya|sarong/, 'Clothing', 'Dress'], [/pajama/, 'Clothing', 'Pajamas'],
  [/swimming trunks|bikini|maillot/, 'Clothing', 'Swimwear'], [/sock|stocking/, 'Clothing', 'Socks'],
  [/running shoe/, 'Clothing', 'Sneakers'], [/sandal|clog|loafer|cowboy boot/, 'Clothing', 'Shoes'],
  [/sunglass/, 'Clothing', 'Sunglasses'], [/cowboy hat|sombrero|bonnet|mortarboard/, 'Clothing', 'Hat'],
  [/bow tie|windsor tie/, 'Clothing', 'Tie'], [/backpack|purse|wallet|mailbag/, 'Shopping', 'Bag'],
  // shopping & gadgets
  [/shopping cart|shopping basket/, 'Groceries', 'Groceries'],
  [/laptop|notebook|desktop computer|monitor|screen/, 'Shopping', 'Gadget'],
  [/cellular telephone|cellphone|ipod|hand-held computer/, 'Shopping', 'Phone'],
  [/television|home theater/, 'Shopping', 'TV'], [/digital watch|analog clock|wall clock|stopwatch/, 'Shopping', 'Watch'],
  [/necklace|ring|perfume|lipstick|lotion|sunscreen|hair spray|face powder/, 'Shopping', 'Beauty'],
  [/teddy|jigsaw puzzle/, 'Shopping', 'Toy'],
  // transport
  [/\bcab\b|taxi/, 'Transport', 'Taxi'], [/minibus|school bus|trolleybus|jeep/, 'Transport', 'Jeepney/Bus'],
  [/passenger car|sports car|convertible|minivan|limousine|pickup|racer|beach wagon/, 'Transport', 'Car ride'],
  [/streetcar|bullet train|electric locomotive|passenger car/, 'Transport', 'Train'],
  [/motor scooter|moped|tricycle/, 'Transport', 'Tricycle/Moto'], [/bicycle|mountain bike/, 'Transport', 'Bike'],
  [/gas pump/, 'Transport', 'Gas'], [/parking meter/, 'Transport', 'Parking'],
  // travel
  [/airliner|airship|wing/, 'Travel', 'Flight'], [/liner|container ship/, 'Travel', 'Cruise'],
  [/speedboat|catamaran|trimaran|canoe|gondola|yawl|schooner|paddle/, 'Travel', 'Boat Ride'],
  [/seashore|sandbar|coral reef/, 'Travel', 'Beach Trip'], [/lakeside/, 'Travel', 'Lake Trip'],
  [/alp|volcano|valley|cliff|promontory|geyser/, 'Travel', 'Mountain Trip'],
  // fun
  [/microphone/, 'Fun', 'Karaoke'], [/carousel|roller coaster|ferris/, 'Fun', 'Theme Park'],
  [/stage/, 'Fun', 'Concert'], [/pool table|ping-pong|basketball|soccer ball|volleyball|tennis ball|golf ball/, 'Fun', 'Games'],
  [/acoustic guitar|electric guitar|drum/, 'Fun', 'Music'], [/joystick|slot/, 'Fun', 'Arcade'],
  // services
  [/barber chair/, 'Service', 'Haircut'], [/washer|iron/, 'Service', 'Laundry'], [/car wash/, 'Service', 'Car Wash'],
  // health
  [/pill bottle|syringe|stethoscope|medicine chest|band aid/, 'Health', 'Medicine'],
]

const titleCase = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase())

function mapPrediction(className) {
  const lower = className.toLowerCase()
  for (const [re, category, title, venue] of RULES) {
    if (re.test(lower)) return { title: title || titleCase(lower.split(',')[0]), category, venue: !!venue }
  }
  return { title: titleCase(lower.split(',')[0]), category: 'Other', venue: false }
}

/**
 * Identify what's in a photo.
 * @param {HTMLImageElement} img
 * @param {object|null} place result from detectPlace()
 * @returns {Promise<Array<{title:string, category:string, confidence:number}>>}
 */
export async function identify(img, place) {
  const out = []
  const push = (s) => {
    if (s.title && !out.some((o) => o.title.toLowerCase() === s.title.toLowerCase())) out.push(s)
  }

  let preds = []
  try {
    const model = await warmUpModel()
    preds = await model.classify(img, 5)
  } catch (e) {
    console.warn('Splitsy AI unavailable', e)
  }

  const mapped = preds.map((p) => ({ ...mapPrediction(p.className), confidence: p.probability }))

  // A venue in the photo (or GPS says we're at one) + a named place → "Pizza Hut Restaurant"
  const venueHit = mapped.find((m) => m.venue && m.confidence > 0.08)
  if (place?.poi) {
    const venue = place.venue || venueHit?.title
    const name = venue && !place.poi.toLowerCase().includes(venue.toLowerCase().split(' ')[0]) ? `${place.poi} ${venue}` : place.poi
    const category = place.venueCategory || venueHit?.category || mapped[0]?.category || 'Other'
    // Put the place first if the photo looks like a place or a meal there
    const placeFirst = venueHit || (mapped[0] && mapped[0].category === category)
    if (placeFirst) push({ title: name, category, confidence: 0.9 })
    mapped.forEach((m) => m.confidence > 0.05 && push(m))
    push({ title: name, category, confidence: 0.5 })
  } else {
    mapped.forEach((m) => m.confidence > 0.05 && push(m))
  }

  return out.slice(0, 4)
}
