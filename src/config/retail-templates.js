const unique = values => [...new Set((values || []).map(value => String(value || '').trim()).filter(Boolean))];

const legacyIconRules = [
  ['iphone|ios|apple phone', ''],
  ['samsung|galaxy', 'SAMSUNG'],
  ['tecno', 'TECNO'],
  ['infinix', 'Infinix'],
  ['redmi|xiaomi', 'Mi'],
  ['itel', 'itel'],
  ['feature phone|used phone|mobile phone|smartphone|phone', '📱'],
  ['jean|denim|trouser|pants?|leggings|cargo pants?|formal pants?|wide-leg|skinny|high-waist', '👖'],
  ['t-shirt|tee|polo|shirt|crop top|tank top|bodysuit|blouse', '👕'],
  ['hoodie|sweatshirt|sweater|cardigan|jacket|coat|blazer|suit|vest|tracksuit|gym wear', '🧥'],
  ['skirt|dress|habesha|kemis|jumpsuit|two-piece|maternity|plus-size|women', '👗'],
  ['men|shorts|traditional men', '👕'],
  ['iphone|samsung|tecno|infinix|redmi|xiaomi|itel|feature phone|used phone|mobile phone|smartphone|phone', '📱'],
  ['case|screen protector|charger|cable|power bank|earphone|earbud|headphone|holder|selfie|memory card|sim card', '🔌'],
  ['laptop|desktop|computer|monitor|keyboard|mouse|ssd|flash disk|ram|webcam', '💻'],
  ['printer|scanner|photocopy|barcode|pos|cash register|laminating|binding|shredder|toner|ink', '🖨️'],
  ['tv|soundbar|theater|speaker|projector|microphone|decoder|remote', '📺'],
  ['camera|cctv|security|doorbell|alarm|dash cam|tripod|ring light|studio light', '📷'],
  ['router|ethernet|network|wi-fi|wifi|modem|access point|fiber', '🌐'],
  ['solar|inverter|ups|battery|extension|stabilizer|lamp|generator|power strip', '🔋'],
  ['gaming|playstation|xbox|controller|game cd|console', '🎮'],
  ['dress|skirt|habesha|kemis|jumpsuit|two-piece|maternity|plus-size|women', '👗'],
  ['men|shirt|polo|t-shirt|hoodie|sweatshirt|jacket|blazer|suit|vest|shorts|tracksuit|trouser|jean|cargo|pant', '👕'],
  ['baby|boys|girls|kids|newborn|school|pajama|toy', '🧸'],
  ['heel|flat shoe|sandal|sneaker|boot|slipper|sports shoe|traditional shoe|shoe', '👟'],
  ['handbag|shoulder bag|crossbody|tote|clutch|backpack|laptop bag|school bag|travel bag|wallet|purse|bag', '👜'],
  ['belt|sunglass|watch|scarf|hat|cap|hair accessory|earring|necklace|bracelet|ring|anklet|brooch|jewelry|tie|bow tie|sock', '🕶️'],
  ['sofa|recliner|coffee table|tv stand|side table|console table|bookshelf|cabinet|living room|ottoman', '🛋️'],
  ['bed|mattress|wardrobe|dressing table|bedside|drawer|crib|bunk|bedroom', '🛏️'],
  ['office desk|executive desk|computer desk|office chair|ergonomic|visitor chair|filing|conference|reception|workstation|office furniture', '🪑'],
  ['dining|bar stool|kitchen table|serving cart', '🍽️'],
  ['garden|outdoor|patio|balcony|umbrella|bench', '🏡'],
  ['shoe rack|clothes rack|storage|shelf|drawer unit|plastic storage', '🗄️'],
  ['wood|mdf|metal|plastic|leather|fabric|imported|locally|custom', '🧱'],
  ['foundation|powder|concealer|primer|blush|highlighter|contour|eyeshadow|eyeliner|mascara|eyebrow|lipstick|lip gloss|makeup|nail polish', '💄'],
  ['cleanser|face wash|cream|moisturizer|sunscreen|toner|serum|mask|scrub|acne|dark spot|anti-aging|eye cream|lip balm|lotion|skincare', '🧴'],
  ['shampoo|conditioner|hair oil|hair cream|hair serum|hair gel|hair spray|edge control|hair treatment|hair mask|dandruff|hair growth|hair dye|relaxer|curl|wig care|hair care', '💇'],
  ['wig|lace front|closure|braiding|crochet|ponytail|bundle|wig cap|wig glue|wig stand|hair extension', '💁'],
  ['perfume|fragrance|body spray|deodorant|roll-on|perfume oil|arabic perfume', '🌸'],
  ['body wash|soap|shower|tooth|mouthwash|feminine|sanitary|cotton|razor|shaving|hair removal|personal care', '🧼'],
  ['dryer|straightener|curling iron|shaver|trimmer|facial steamer|nail dryer|manicure|pedicure|mirror|eyelash|tweezer|beauty tool', '🪞'],
  ['barber|salon|clipper|washing basin|hair steamer|salon chair|salon mirror|salon towel|cape', '✂️'],
  ['blender|juicer|processor|mixer|kettle|coffee|espresso|toaster|sandwich|rice cooker|pressure cooker|air fryer|microwave|oven|stove|hot plate|mitad|grinder|chopper|deep fryer|popcorn|kitchen appliance', '🍳'],
  ['refrigerator|freezer|washing machine|dryer|dishwasher|water dispenser|cooker|large appliance', '🧊'],
  ['vacuum|steam cleaner|carpet cleaner|iron|garment steamer|fan|air cooler|air conditioner|heater|humidifier|dehumidifier|home appliance', '🏠'],
  ['pot|pan|cooking set|baking|plate|bowl|cup|glass|mug|spoon|fork|knife|cutlery|tray|thermos|water bottle|lunch box|food storage|kitchenware', '🥘'],
  ['jebena|rekebot|sini|injera|mesob|clay|berbere|spice|traditional ethiopian', '☕'],
  ['mop|broom|bucket|dustbin|cleaning|dish rack|laundry basket|detergent|spray bottle|glove|floor wiper', '🧹'],
  ['hanger|laundry rack|wall hook|kitchen rack|bathroom shelf|wardrobe organizer|home organization', '📦'],
  ['bedsheet|blanket|comforter|duvet|pillow|towel|bathrobe|curtain|carpet|rug|tablecloth|sofa cover|textile|bedding', '🛌'],
  ['bulb|ceiling light|wall light|chandelier|desk lamp|night light|solar lamp|decorative light|strip light|lighting', '💡'],
  ['new arrival', '✨'],
  ['best seller', '🔥'],
  ['discount', '🏷️'],
  ['accessories', '🧩'],
  ['other', '📦']
];

const iconRules = [
  ['iphone|ios|apple phone', ''],
  ['samsung|galaxy', 'SAMSUNG'],
  ['tecno', 'TECNO'],
  ['infinix', 'Infinix'],
  ['redmi|xiaomi', 'Mi'],
  ['itel', 'itel'],
  ['feature phone|used phone|mobile phone|smartphone|phone', '📱'],
  ['jean|denim|trouser|pants?|leggings|cargo pants?|formal pants?|wide-leg|skinny|high-waist', '👖'],
  ['t-shirt|tee|polo|shirt|crop top|tank top|bodysuit|blouse', '👕'],
  ['hoodie|sweatshirt|sweater|cardigan|jacket|coat|blazer|suit|vest|tracksuit|gym wear', '🧥'],
  ['skirt|dress|habesha|kemis|jumpsuit|two-piece|maternity|plus-size|women', '👗'],
  ['men|shorts|traditional men', '👔'],
  ['case|screen protector|charger|cable|power bank|earphone|earbud|headphone|holder|selfie|memory card|sim card', '🔌'],
  ['laptop|desktop|computer|monitor|keyboard|mouse|ssd|flash disk|ram|webcam', '💻'],
  ['printer|scanner|photocopy|barcode|pos|cash register|laminating|binding|shredder|toner|ink', '🖨️'],
  ['tv|soundbar|theater|speaker|projector|microphone|decoder|remote', '📺'],
  ['camera|cctv|security|doorbell|alarm|dash cam|tripod|ring light|studio light', '📷'],
  ['router|ethernet|network|wi-fi|wifi|modem|access point|fiber', '🌐'],
  ['solar|inverter|ups|battery|extension|stabilizer|lamp|generator|power strip', '🔋'],
  ['gaming|playstation|xbox|controller|game cd|console', '🎮'],
  ['baby|boys|girls|kids|newborn|school|pajama|toy', '🧸'],
  ['heel|flat shoe|sandal|sneaker|boot|slipper|sports shoe|traditional shoe|shoe', '👟'],
  ['handbag|shoulder bag|crossbody|tote|clutch|backpack|laptop bag|school bag|travel bag|wallet|purse|bag', '👜'],
  ['belt|sunglass|watch|scarf|hat|cap|hair accessory|earring|necklace|bracelet|ring|anklet|brooch|jewelry|tie|bow tie|sock', '💍'],
  ['sofa|recliner|coffee table|tv stand|side table|console table|bookshelf|cabinet|living room|ottoman', '🛋️'],
  ['bed|mattress|wardrobe|dressing table|bedside|drawer|crib|bunk|bedroom', '🛏️'],
  ['office desk|executive desk|computer desk|office chair|ergonomic|visitor chair|filing|conference|reception|workstation|office furniture', '🪑'],
  ['dining|bar stool|kitchen table|serving cart', '🍽️'],
  ['garden|outdoor|patio|balcony|umbrella|bench', '🏡'],
  ['shoe rack|clothes rack|storage|shelf|drawer unit|plastic storage', '🗄️'],
  ['wood|mdf|metal|plastic|leather|fabric|imported|locally|custom', '🧱'],
  ['foundation|powder|concealer|primer|blush|highlighter|contour|eyeshadow|eyeliner|mascara|eyebrow|lipstick|lip gloss|makeup|nail polish', '💄'],
  ['cleanser|face wash|cream|moisturizer|sunscreen|toner|serum|mask|scrub|acne|dark spot|anti-aging|eye cream|lip balm|lotion|skincare', '🧴'],
  ['shampoo|conditioner|hair oil|hair cream|hair serum|hair gel|hair spray|edge control|hair treatment|hair mask|dandruff|hair growth|hair dye|relaxer|curl|wig care|hair care', '💇'],
  ['wig|lace front|closure|braiding|crochet|ponytail|bundle|wig cap|wig glue|wig stand|hair extension', '💁'],
  ['perfume|fragrance|body spray|deodorant|roll-on|perfume oil|arabic perfume', '🌸'],
  ['body wash|soap|shower|tooth|mouthwash|feminine|sanitary|cotton|razor|shaving|hair removal|personal care', '🧼'],
  ['dryer|straightener|curling iron|shaver|trimmer|facial steamer|nail dryer|manicure|pedicure|mirror|eyelash|tweezer|beauty tool', '🪞'],
  ['barber|salon|clipper|washing basin|hair steamer|salon chair|salon mirror|salon towel|cape', '✂️'],
  ['blender|juicer|processor|mixer|kettle|coffee|espresso|toaster|sandwich|rice cooker|pressure cooker|air fryer|microwave|oven|stove|hot plate|mitad|grinder|chopper|deep fryer|popcorn|kitchen appliance', '🍳'],
  ['refrigerator|freezer|washing machine|dryer|dishwasher|water dispenser|cooker|large appliance', '🧊'],
  ['vacuum|steam cleaner|carpet cleaner|iron|garment steamer|fan|air cooler|air conditioner|heater|humidifier|dehumidifier|home appliance', '🏠'],
  ['pot|pan|cooking set|baking|plate|bowl|cup|glass|mug|spoon|fork|knife|cutlery|tray|thermos|water bottle|lunch box|food storage|kitchenware', '🥘'],
  ['jebena|rekebot|sini|injera|mesob|clay|berbere|spice|traditional ethiopian', '☕'],
  ['mop|broom|bucket|dustbin|cleaning|dish rack|laundry basket|detergent|spray bottle|glove|floor wiper', '🧹'],
  ['hanger|laundry rack|wall hook|kitchen rack|bathroom shelf|wardrobe organizer|home organization', '📦'],
  ['bedsheet|blanket|comforter|duvet|pillow|towel|bathrobe|curtain|carpet|rug|tablecloth|sofa cover|textile|bedding', '🛌'],
  ['bulb|ceiling light|wall light|chandelier|desk lamp|night light|solar lamp|decorative light|strip light|lighting', '💡'],
  ['new arrival', '✨'],
  ['best seller', '🔥'],
  ['discount', '🏷️'],
  ['accessories', '🧩'],
  ['.*', '📦']
];

const safeStoredIcon = value => {
  const icon = String(value || '').trim();
  return /[\u00c2\u00c3\u00c5\u00e2\u00ef\u00f0]/i.test(icon) ? '' : icon;
};

const coreIconRules = [
  ['traditional dresses?|habesha|kemis|modern habesha|traditional jewelry|kids.*traditional', '👗✨'],
  ['women.?s clothing', '👩‍💼'],
  ['men.?s clothing', '👨‍💼'],
  ['kids.? clothing', '👶'],
  ['mobile phones?', '📱'],
  ['phone accessories', '🔌'],
  ['computers? & laptops?|computers?|laptops?', '💻'],
  ['printers? & office|office electronics', '🖨️'],
  ['tv & entertainment|entertainment', '📺'],
  ['cameras? & security|security camera|cctv', '🔒'],
  ['networking|routers?|modems?|access points?', '🌐'],
  ['solar & power|solar|inverter|ups|generator', '☀️'],
  ['gaming|playstation|xbox|console', '🎮'],
  ['living room furniture', '🛋️'],
  ['bedroom furniture', '🛏️'],
  ['office furniture', '💼'],
  ['dining furniture', '🍽️'],
  ['outdoor furniture', '🏡'],
  ['storage furniture', '📦'],
  ['kids.? furniture', '🧸'],
  ['furniture materials?|custom|wood|mdf|metal|plastic|leather', '🔨'],
  ['makeup', '💄'],
  ['skincare', '🧴'],
  ['hair care', '💇‍♀️'],
  ['wigs?|hair extensions?', '👱‍♀️'],
  ['perfumes?|fragrances?', '✨'],
  ['personal care', '🪥'],
  ['beauty tools?', '🔌'],
  ['salon products?', '💈'],
  ['kitchen appliances?', '🍳'],
  ['large appliances?', '🧊'],
  ['home appliances?', '🧹'],
  ['kitchenware', '🍽️'],
  ['traditional ethiopian kitchen', '🇪🇹'],
  ['cleaning supplies', '🧽'],
  ['home organization', '📦'],
  ['bedding|home textile', '🛏️'],
  ['lighting', '💡'],
  ['iphone|ios|apple phone', '\uF8FF'],
  ['samsung|galaxy', 'SAMSUNG'],
  ['tecno', 'TECNO'],
  ['infinix', 'Infinix'],
  ['redmi|xiaomi', 'Xiaomi'],
  ['itel', 'itel'],
  ['major brands?', '📱✨'],
  ['feature phone|used phone', '📞'],
  ['smart\\s*phone|mobile phone|phone', '📱'],
  ['dresses?|long dress|short dress|party dress|office dress|casual dress', '👗'],
  ['skirts?|mini skirt|long skirt', '🩱'],
  ['jeans?|denim|skinny|wide-leg|high-waist|slim-fit|regular jeans|cargo jeans', '👖'],
  ['trousers?|formal pants?|cargo pants?|leggings', '👖👔'],
  ['shirts?|crop tops?|t-shirts?|tank tops?|bodysuits?|blouses?|polo|oversized', '👚'],
  ['cardigans?|sweaters?|hoodies?|knitwear', '🧥'],
  ['jackets?|blazers?|coats?|outerwear|leather jacket|bomber', '🧥💼'],
  ['jumpsuits?|two-piece|tracksuits?', '🥻'],
  ['gym wear|sportswear', '🏋️‍♀️'],
  ['maternity', '🤰'],
  ['plus-size|plus size', '💃'],
  ['shorts?|vests?|sweatshirts?', '🎽'],
  ['suits?|blazers?', '👔'],
  ['traditional men', '👑'],
  ['baby clothes|newborn', '🍼'],
  ['boys|girls|kids.? dresses|kids.? jeans|kids.? t-shirts', '🧒'],
  ['school clothes|kids.? jackets|kids.? pajamas', '🎒'],
  ['heels?', '👠'],
  ['flat shoes?|sandals?|slippers?', '👡'],
  ['sneakers?|sports shoes?', '👟'],
  ['boots?', '🥾'],
  ['kids.? shoes?', '👟👶'],
  ['traditional shoes?', '🥿'],
  ['shoes?', '👟'],
  ['handbags?|shoulder bags?|crossbody|tote|clutch', '👜'],
  ['backpacks?|school bags?', '🎒'],
  ['laptop bags?|travel bags?|wallets?|purses?', '💼'],
  ['bags?', '👜'],
  ['belts?|ties?|bow ties?', '👔'],
  ['sunglasses?', '🕶️'],
  ['watches?', '⌚'],
  ['scarves?|hats?|caps?|socks?', '🧣'],
  ['jewelry|earrings?|necklaces?|bracelets?|rings?|anklets?', '💍'],
  ['perfume gift sets?', '🎁'],
  ['cases?|screen protectors?|holders?', '🛡️'],
  ['chargers?|cables?|type-c|fast charger|iphone cables?', '⚡'],
  ['power banks?', '🔋'],
  ['earphones?|earbuds?|headphones?|audio', '🎧'],
  ['selfie sticks?|memory cards?|sim adapters?', '📸'],
  ['gaming laptops?|business laptops?|used laptops?', '💻'],
  ['desktops?|monitors?', '🖥️'],
  ['keyboards?|mouse|stands?|webcams?|peripherals', '⌨️'],
  ['hard drives?|ssd|flash disks?|ram|storage', '💾'],
  ['printers?|scanners?|inkjet|laser|all-in-one', '🖨️'],
  ['ink|toner', '🫙'],
  ['pos|cash registers?|barcode scanners?|retail tech', '💳'],
  ['laminating|binding|shredders?|processing', '📄'],
  ['smart tv|led tv|android tv|tvs?', '📺'],
  ['tv boxes?|receivers?|remotes?', '🎛️'],
  ['soundbars?|home theaters?|speakers?', '🔊'],
  ['projectors?|screens?', '📹'],
  ['dvr|nvr|ip cameras?|wi-fi cameras?|security camera', '🛡️📹'],
  ['door cameras?|alarm systems?|smart home', '🚨'],
  ['digital cameras?|tripods?|ring lights?|production', '📸'],
  ['wi-?fi|routers?|modems?|extenders?|access points?', '📶'],
  ['network switches?|ethernet cables?', '🔌'],
  ['solar panels?|solar lights?', '☀️🔋'],
  ['inverters?|ups devices?|ups batteries?|power backups?', '⚡'],
  ['stabilizers?|extension cords?|generators?|management', '🔌'],
  ['controllers?|headsets?|gaming chairs?|accessories', '🕹️'],
  ['sofas?|recliners?|ottomans?|seating', '🛋️'],
  ['coffee tables?|side tables?|console|tv stands?', '📺🗄️'],
  ['bookshelves?|display cabinets?', '📚'],
  ['beds?|mattresses?|queen|king|single bed|double bed', '🛏️'],
  ['wardrobes?|chest of drawers?', '🚪🗄️'],
  ['dressing tables?|bedside tables?|vanity', '🪞'],
  ['baby cribs?|bunk beds?', '🍼🛏️'],
  ['desks?|workstations?|computer desk|executive desk', '🖥️🏢'],
  ['chairs?|ergonomic|visitor', '🪑'],
  ['filing cabinets?|filing|bookshelves?', '📁'],
  ['dining tables?|dining chairs?|bar stools?|sets?', '🍽️🪑'],
  ['patio|garden chairs?|shades?|benches?', '⛱️🪑'],
  ['shoe racks?|clothes racks?|wall shelves?|cabinets?', '🗄️'],
  ['study desks?|toy storage|high chairs?', '✏️🧸'],
  ['foundation|concealer|powder|blush|face', '🎨'],
  ['eyeshadow|eyeliner|mascara|eyes', '👁️'],
  ['lipstick|lip gloss|liner|lips', '💄'],
  ['brushes?|palettes?|blenders?|nails?|tools', '💅'],
  ['cleanser|wash|toner|sunscreen', '🧴'],
  ['serums?|retinol|acne|anti-aging|treatments?', '🧪'],
  ['masks?|body lotion', '🧖‍♀️'],
  ['shampoo|oil|gel|spray|styling', '🧴✂️'],
  ['dandruff|growth oil|dye', '🧪🌿'],
  ['human hair|synthetic|lace front', '💇‍♀️✨'],
  ['braiding|crochet|bundles?|glue', '🧶'],
  ['arabic|oils?|unisex|men.?s perfume|women.?s perfume', '🧪💨'],
  ['deodorant|body spray', '🌬️'],
  ['soap|body wash|toothbrush|feminine|hygiene', '🧼'],
  ['razors?|shaving|cotton|grooming', '🪒'],
  ['hair dryers?|straighteners?|shavers?', '⚡✂️'],
  ['facial steamers?|manicure|mirrors?', '🪞'],
  ['clippers?|salon chairs?|steamers?|basins?', '💈🪑'],
  ['blenders?|kettles?|coffee makers?|air fryers?|countertop', '🌪️☕'],
  ['microwaves?|ovens?|stoves?|cooking', '♨️'],
  ['injera|mitad|electric mitad', '🫓⚡'],
  ['refrigerators?|chest freezers?|freezers?', '❄️'],
  ['washing machines?|dryers?|laundry', '🌀'],
  ['water dispensers?|standing cookers?', '🚰'],
  ['vacuum|steam cleaners?|cleaning', '🧹'],
  ['irons?|garment steamers?|fabric care', '💨👔'],
  ['fans?|ac|air conditioner|heaters?|humidifiers?|climate', '❄️🔥'],
  ['pots?|pans?|baking molds?|cookware', '🍳'],
  ['plates?|bowls?|cups?|cutlery|tableware', '🍽️'],
  ['flasks?|lunch boxes?|containers?|storage', '🍱'],
  ['jebena|coffee cups?|rekebot|sini', '☕🏺'],
  ['mesob', '🧺✨'],
  ['clay pots?|berbere|spice containers?', '🏺🌶️'],
  ['mops?|brooms?|buckets?|dustbins?|gloves?', '🪣🧹'],
  ['storage boxes?|racks?|wardrobe organizers?', '🗄️'],
  ['bedsheets?|comforters?|pillows?|towels?|linens?', '🛏️🧺'],
  ['curtains?|carpets?|rugs?|sofa covers?|decor', '🖼️🛋️'],
  ['bulbs?|ceiling lights?|chandeliers?|strip lights?', '💡✨'],
  ['new arrival', '✨'],
  ['best seller', '🔥'],
  ['discount|sale|promo', '🏷️']
];

const cleanIconRules = [
  ['iphone|ios|apple phone|samsung|galaxy|tecno|infinix|redmi|xiaomi|itel|feature phone|used phone|mobile|smartphone|phone', '\uD83D\uDCF1'],
  ['phone cases?|covers?|screen protectors?|holders?', '\uD83D\uDEE1\uFE0F'],
  ['chargers?|cables?|type-c|power banks?|extension cords?', '\u26A1'],
  ['earphones?|earbuds?|headphones?|audio', '\uD83C\uDFA7'],
  ['selfie|memory card|sim adapter', '\uD83D\uDCF8'],
  ['laptop|notebook|desktop|computer|pc|monitor', '\uD83D\uDCBB'],
  ['keyboard|mouse|webcam|stand|peripheral', '\u2328\uFE0F'],
  ['ssd|hard drive|flash disk|ram|storage', '\uD83D\uDCBE'],
  ['printer|scanner|photocopy|barcode|pos|cash register|toner|ink|laminating|binding|shredder', '\uD83D\uDDA8\uFE0F'],
  ['smart tv|led tv|android tv|tv box|receiver|remote|television', '\uD83D\uDCFA'],
  ['soundbar|home theater|speaker|projector|microphone', '\uD83D\uDD0A'],
  ['camera|cctv|security|doorbell|alarm|tripod|ring light|studio light', '\uD83D\uDCF7'],
  ['router|wi-?fi|ethernet|network|modem|access point|fiber|switch', '\uD83D\uDCF6'],
  ['solar|inverter|ups|battery|generator|stabilizer|power', '\uD83D\uDD0B'],
  ['gaming|playstation|xbox|controller|console|gamepad', '\uD83C\uDFAE'],
  ['jeans?|denim|trouser|pants?|leggings|cargo|wide-leg|skinny|high-waist', '\uD83D\uDC56'],
  ['dress|habesha|kemis|gown|party dress|office dress|casual dress', '\uD83D\uDC57'],
  ['skirt', '\uD83E\uDE71'],
  ['t-shirt|tee|polo|shirt|crop top|tank top|bodysuit|blouse', '\uD83D\uDC5A'],
  ['hoodie|sweatshirt|sweater|cardigan|jacket|coat|blazer|suit|vest|tracksuit|outerwear|knitwear', '\uD83E\uDDE5'],
  ['maternity', '\uD83E\uDD30'],
  ['baby|newborn', '\uD83C\uDF7C'],
  ['kids?|boys|girls|school|pajama|toy', '\uD83E\uDDD2'],
  ['heel', '\uD83D\uDC60'],
  ['flat shoe|sandal|slipper', '\uD83D\uDC61'],
  ['sneaker|sports shoe|shoe', '\uD83D\uDC5F'],
  ['boot', '\uD83E\uDD7E'],
  ['handbag|shoulder bag|crossbody|tote|clutch|bag', '\uD83D\uDC5C'],
  ['backpack|school bag', '\uD83C\uDF92'],
  ['laptop bag|travel bag|wallet|purse', '\uD83D\uDCBC'],
  ['belt|tie|bow tie', '\uD83D\uDC54'],
  ['sunglass', '\uD83D\uDD76\uFE0F'],
  ['watch', '\u231A'],
  ['scarf|hat|cap|sock', '\uD83E\uDDE3'],
  ['jewelry|earring|necklace|bracelet|ring|anklet', '\uD83D\uDC8D'],
  ['sofa|living room|recliner|ottoman|seating', '\uD83D\uDECB\uFE0F'],
  ['coffee table|side table|console|tv stand|wardrobe|drawer|cabinet|shelf|storage|rack', '\uD83D\uDDC4\uFE0F'],
  ['bed|mattress|bedroom|crib|bunk', '\uD83D\uDECF\uFE0F'],
  ['desk|office|workstation', '\uD83C\uDFE2'],
  ['chair|stool', '\uD83E\uDE91'],
  ['dining|kitchen table', '\uD83C\uDF7D\uFE0F'],
  ['outdoor|garden|patio|balcony|bench|shade', '\uD83C\uDFE1'],
  ['wood|mdf|metal|plastic|leather|custom', '\uD83D\uDD28'],
  ['makeup|lipstick|mascara|eyeliner|foundation|concealer|powder|blush|nail', '\uD83D\uDC84'],
  ['skincare|cream|serum|sunscreen|cleanser|lotion|mask|scrub|toner|retinol|acne', '\uD83E\uDDF4'],
  ['wig|hair extension|braiding|crochet|bundle|hair|shampoo|conditioner|salon|barber|clipper|dryer|straightener|shaver', '\uD83D\uDC87\u200D\u2640\uFE0F'],
  ['perfume|fragrance|deodorant|body spray|arabic perfume|oil', '\u2728'],
  ['soap|shower|tooth|mouthwash|razor|personal care|hygiene|feminine|cotton', '\uD83E\uDDFC'],
  ['beauty tool|facial steamer|manicure|pedicure|mirror|tweezer', '\uD83E\uDE9E'],
  ['blender|juicer|kettle|coffee|toaster|cooker|air fryer|microwave|oven|stove|mitad|kitchen appliance', '\uD83C\uDF73'],
  ['refrigerator|freezer|washing machine|dryer|dishwasher|dispenser|large appliance', '\u2744\uFE0F'],
  ['vacuum|iron|fan|air conditioner|heater|humidifier|home appliance', '\uD83E\uDDF9'],
  ['pot|pan|plate|bowl|cup|glass|mug|spoon|fork|knife|kitchenware|cookware|tableware', '\uD83C\uDF7D\uFE0F'],
  ['jebena|rekebot|sini|injera|mesob|clay|spice|berbere|ethiopian', '\u2615'],
  ['mop|broom|cleaning|bucket|dustbin|laundry|detergent|glove', '\uD83E\uDDFD'],
  ['bedsheet|blanket|pillow|towel|curtain|carpet|rug|textile|bedding', '\uD83D\uDECF\uFE0F'],
  ['light|bulb|lamp|chandelier|lighting', '\uD83D\uDCA1'],
  ['new arrival', '\u2728'],
  ['best seller', '\uD83D\uDD25'],
  ['discount|sale|promo', '\uD83C\uDFF7\uFE0F'],
  ['accessor', '\uD83E\uDDE9']
];

export const iconForRetailLabel = value => {
  const text = String(value || '').toLowerCase();
  const cleanMatch = cleanIconRules.find(([pattern]) => new RegExp(pattern, 'i').test(text));
  if (cleanMatch?.[1]) return cleanMatch[1];
  return '\u{1F4E6}';
};

const template = (label, categories) => ({
  label,
  categories: categories.map(([name, subcategories]) => ({
    name,
    icon: iconForRetailLabel(name),
    subcategories: unique(subcategories),
    subcategoryIcons: Object.fromEntries(unique(subcategories).map(subcategory => [subcategory, iconForRetailLabel(subcategory)]))
  }))
});

export const retailTemplates = {
  fashion: template('Fashion Boutique', [
    ['Women\'s Clothing', ['Women\'s dresses', 'Long dresses', 'Short dresses', 'Party dresses', 'Office dresses', 'Casual dresses', 'Traditional dresses', 'Habesha kemis', 'Modern Habesha dresses', 'Women\'s skirts', 'Mini skirts', 'Long skirts', 'Women\'s jeans', 'Skinny jeans', 'Wide-leg jeans', 'High-waist jeans', 'Women\'s trousers', 'Formal pants', 'Cargo pants', 'Leggings', 'Women\'s shirts', 'Crop tops', 'T-shirts', 'Tank tops', 'Bodysuits', 'Cardigans', 'Sweaters', 'Hoodies', 'Jackets', 'Blazers', 'Coats', 'Jumpsuits', 'Two-piece sets', 'Tracksuits', 'Gym wear', 'Maternity clothes', 'Plus-size clothing']],
    ['Men\'s Clothing', ['Men\'s jeans', 'Slim-fit jeans', 'Regular jeans', 'Cargo jeans', 'Men\'s trousers', 'Formal pants', 'Cargo pants', 'Men\'s shirts', 'Casual shirts', 'Polo shirts', 'T-shirts', 'Oversized T-shirts', 'Tank tops', 'Hoodies', 'Sweatshirts', 'Jackets', 'Leather jackets', 'Bomber jackets', 'Blazers', 'Suits', 'Vests', 'Shorts', 'Tracksuits', 'Gym wear', 'Traditional men\'s clothing', 'Plus-size men\'s clothing']],
    ['Kids\' Clothing', ['Baby clothes', 'Boys\' clothes', 'Girls\' clothes', 'Kids\' dresses', 'Kids\' jeans', 'Kids\' T-shirts', 'Kids\' jackets', 'Kids\' pajamas', 'School clothes', 'Kids\' traditional clothes', 'Newborn sets']],
    ['Shoes', ['Women\'s heels', 'Flat shoes', 'Sandals', 'Sneakers', 'Boots', 'Slippers', 'Men\'s sneakers', 'Men\'s sandals', 'Kids\' shoes', 'Sports shoes', 'Traditional shoes']],
    ['Bags', ['Women\'s handbags', 'Shoulder bags', 'Crossbody bags', 'Tote bags', 'Clutch bags', 'Backpacks', 'Laptop bags', 'School bags', 'Travel bags', 'Wallets', 'Purses']],
    ['Fashion Accessories', ['Belts', 'Sunglasses', 'Watches', 'Scarves', 'Hats', 'Caps', 'Hair accessories', 'Earrings', 'Necklaces', 'Bracelets', 'Rings', 'Anklets', 'Brooches', 'Traditional jewelry', 'Perfume gift sets', 'Socks', 'Ties', 'Bow ties']]
  ]),
  electronics: template('Electronics', [
    ['Mobile Phones', ['iPhones', 'Samsung', 'Tecno', 'Infinix', 'Redmi/Xiaomi phones', 'Itel', 'Feature phones', 'Used phones']],
    ['Phone Accessories', ['Phone cases', 'Screen protectors', 'Chargers', 'Fast chargers', 'USB cables', 'Type-C cables', 'iPhone cables', 'Power banks', 'Earphones', 'Wireless earbuds', 'Bluetooth headphones', 'Phone holders', 'Car phone holders', 'Selfie sticks', 'Memory cards', 'SIM card adapters']],
    ['Computers & Laptops', ['Laptops', 'Desktop computers', 'Gaming laptops', 'Business laptops', 'Used laptops', 'Monitors', 'Keyboards', 'Mouse', 'Wireless mouse', 'Laptop chargers', 'Laptop bags', 'Laptop stands', 'Cooling pads', 'External hard drives', 'SSD drives', 'Flash disks', 'RAM', 'Computer speakers', 'Webcams']],
    ['Printers & Office Electronics', ['Printers', 'Inkjet printers', 'Laser printers', 'All-in-one printers', 'Printer ink', 'Toner cartridges', 'Scanners', 'Photocopy machines', 'Barcode scanners', 'POS machines', 'Cash registers', 'Laminating machines', 'Binding machines', 'Paper shredders']],
    ['TV & Entertainment', ['Smart TVs', 'LED TVs', 'Android TVs', 'TV boxes', 'Satellite receivers', 'Decoders', 'Remote controls', 'Soundbars', 'Home theaters', 'Speakers', 'Bluetooth speakers', 'Projectors', 'Projector screens', 'Microphones']],
    ['Cameras & Security', ['CCTV cameras', 'IP cameras', 'Wi-Fi cameras', 'Security camera kits', 'DVR/NVR systems', 'Door cameras', 'Video doorbells', 'Alarm systems', 'Dash cameras', 'Digital cameras', 'Tripods', 'Ring lights', 'Studio lights']],
    ['Networking', ['Wi-Fi routers', '4G routers', 'Ethernet cables', 'Network switches', 'Wi-Fi extenders', 'Modems', 'Access points', 'Fiber routers']],
    ['Solar & Power', ['Solar panels', 'Solar lights', 'Inverters', 'UPS batteries', 'UPS devices', 'Extension cords', 'Voltage stabilizers', 'Rechargeable lamps', 'Emergency lights', 'Generators', 'Power strips']],
    ['Gaming', ['PlayStation consoles', 'Xbox consoles', 'Game controllers', 'Gaming headsets', 'Gaming keyboards', 'Gaming mouse', 'Gaming chairs', 'Game CDs', 'Console accessories']]
  ]),
  furniture: template('Furniture', [
    ['Living Room Furniture', ['Sofas', 'Sofa sets', 'L-shaped sofas', 'Single sofas', 'Recliner chairs', 'Coffee tables', 'TV stands', 'Side tables', 'Console tables', 'Bookshelves', 'Display cabinets', 'Living room chairs', 'Ottoman stools']],
    ['Bedroom Furniture', ['Beds', 'Single beds', 'Double beds', 'Queen beds', 'King beds', 'Bed frames', 'Mattresses', 'Wardrobes', 'Dressing tables', 'Bedside tables', 'Chest of drawers', 'Bedroom sets', 'Baby cribs', 'Bunk beds']],
    ['Office Furniture', ['Office desks', 'Executive desks', 'Computer desks', 'Office chairs', 'Ergonomic chairs', 'Visitor chairs', 'Filing cabinets', 'Conference tables', 'Reception desks', 'Bookshelves', 'Workstations']],
    ['Dining Furniture', ['Dining tables', 'Dining chairs', 'Dining sets', 'Bar stools', 'Kitchen tables', 'Serving carts', 'Cabinets']],
    ['Outdoor Furniture', ['Garden chairs', 'Outdoor tables', 'Patio sets', 'Plastic chairs', 'Metal chairs', 'Balcony furniture', 'Umbrella shades', 'Outdoor benches']],
    ['Storage Furniture', ['Shoe racks', 'Clothes racks', 'Storage cabinets', 'Kitchen cabinets', 'Shelves', 'Wall shelves', 'Drawer units', 'Plastic storage units']],
    ['Kids\' Furniture', ['Kids\' beds', 'Study desks', 'Kids\' chairs', 'Toy storage', 'Baby cribs', 'High chairs']],
    ['Furniture Materials / Types', ['Wooden furniture', 'MDF furniture', 'Metal furniture', 'Plastic furniture', 'Leather sofas', 'Fabric sofas', 'Imported furniture', 'Locally made furniture', 'Custom-made furniture']]
  ]),
  beauty: template('Beauty and Cosmetics', [
    ['Makeup', ['Foundation', 'Powder', 'Concealer', 'Primer', 'Setting spray', 'Blush', 'Highlighter', 'Contour', 'Eyeshadow', 'Eyeliner', 'Mascara', 'Eyebrow pencil', 'Lipstick', 'Lip gloss', 'Lip liner', 'Makeup palettes', 'Makeup brushes', 'Beauty blenders', 'False eyelashes', 'Nail polish']],
    ['Skincare', ['Face cleanser', 'Face wash', 'Face cream', 'Moisturizer', 'Sunscreen', 'Toner', 'Serum', 'Vitamin C serum', 'Retinol serum', 'Face masks', 'Sheet masks', 'Scrubs', 'Acne treatment', 'Dark spot cream', 'Anti-aging cream', 'Eye cream', 'Lip balm', 'Body lotion', 'Hand cream', 'Foot cream']],
    ['Hair Care', ['Shampoo', 'Conditioner', 'Hair oil', 'Hair cream', 'Hair serum', 'Hair gel', 'Hair spray', 'Edge control', 'Hair treatment', 'Hair mask', 'Dandruff treatment', 'Hair growth oil', 'Hair dye', 'Relaxer', 'Curl activator', 'Wig care products']],
    ['Wigs & Hair Extensions', ['Human hair wigs', 'Synthetic wigs', 'Lace front wigs', 'Closure wigs', 'Braiding hair', 'Crochet hair', 'Ponytail extensions', 'Hair bundles', 'Wig caps', 'Wig glue', 'Wig stands']],
    ['Perfumes & Fragrances', ['Women\'s perfume', 'Men\'s perfume', 'Unisex perfume', 'Body spray', 'Deodorant', 'Roll-on', 'Perfume oils', 'Arabic perfumes', 'Gift perfume sets']],
    ['Personal Care', ['Body wash', 'Soap', 'Shower gel', 'Toothpaste', 'Toothbrush', 'Mouthwash', 'Feminine hygiene products', 'Sanitary pads', 'Cotton pads', 'Cotton buds', 'Razors', 'Shaving cream', 'Hair removal cream']],
    ['Beauty Tools', ['Hair dryers', 'Hair straighteners', 'Curling irons', 'Electric shavers', 'Trimmers', 'Facial steamers', 'Nail dryers', 'Manicure sets', 'Pedicure sets', 'Makeup mirrors', 'Eyelash curlers', 'Tweezers']],
    ['Salon Products', ['Barber clippers', 'Salon chairs', 'Hair washing basin', 'Hair steamers', 'Nail salon tools', 'Professional hair dryers', 'Salon mirrors', 'Salon towels', 'Barber capes']]
  ]),
  home_kitchen: template('Home and Kitchen Appliances', [
    ['Kitchen Appliances', ['Blenders', 'Juicers', 'Food processors', 'Mixers', 'Electric kettles', 'Coffee makers', 'Espresso machines', 'Toasters', 'Sandwich makers', 'Rice cookers', 'Pressure cookers', 'Air fryers', 'Microwaves', 'Ovens', 'Electric stoves', 'Gas stoves', 'Hot plates', 'Injera mitad', 'Electric mitad', 'Meat grinders', 'Choppers', 'Deep fryers', 'Popcorn makers']],
    ['Large Appliances', ['Refrigerators', 'Freezers', 'Washing machines', 'Dryers', 'Dishwashers', 'Water dispensers', 'Standing cookers', 'Built-in ovens', 'Gas cookers', 'Chest freezers']],
    ['Home Appliances', ['Vacuum cleaners', 'Steam cleaners', 'Carpet cleaners', 'Irons', 'Steam irons', 'Garment steamers', 'Fans', 'Standing fans', 'Table fans', 'Air coolers', 'Air conditioners', 'Heaters', 'Humidifiers', 'Dehumidifiers']],
    ['Kitchenware', ['Pots', 'Pans', 'Frying pans', 'Cooking sets', 'Pressure pots', 'Baking trays', 'Cake molds', 'Plates', 'Bowls', 'Cups', 'Glasses', 'Mugs', 'Spoons', 'Forks', 'Knives', 'Cutlery sets', 'Serving trays', 'Thermos flasks', 'Water bottles', 'Lunch boxes', 'Food storage containers']],
    ['Traditional Ethiopian Kitchen Items', ['Jebena', 'Coffee cups', 'Rekebot', 'Sini sets', 'Mitad', 'Injera baking tools', 'Mesob', 'Clay pots', 'Berbere storage containers', 'Spice containers', 'Traditional serving trays']],
    ['Cleaning Supplies', ['Mops', 'Brooms', 'Buckets', 'Dustbins', 'Cleaning brushes', 'Dish racks', 'Laundry baskets', 'Detergent containers', 'Spray bottles', 'Gloves', 'Floor wipers']],
    ['Home Organization', ['Storage boxes', 'Plastic drawers', 'Clothes hangers', 'Shoe racks', 'Laundry racks', 'Wall hooks', 'Kitchen racks', 'Bathroom shelves', 'Wardrobe organizers']],
    ['Bedding & Home Textile', ['Bedsheets', 'Blankets', 'Comforters', 'Duvets', 'Pillows', 'Pillow covers', 'Mattress covers', 'Towels', 'Bathrobes', 'Curtains', 'Carpets', 'Rugs', 'Tablecloths', 'Sofa covers']],
    ['Lighting', ['LED bulbs', 'Rechargeable bulbs', 'Ceiling lights', 'Wall lights', 'Chandeliers', 'Desk lamps', 'Night lights', 'Solar lamps', 'Decorative lights', 'Strip lights']]
  ]),
  general: template('General Retail', [
    ['New Arrivals', []],
    ['Best Sellers', []],
    ['Discount Items', []],
    ['Accessories', []],
    ['Other Products', []]
  ])
};

const typeAliases = [
  ['fashion', ['fashion', 'boutique', 'clothing', 'shoe', 'bag']],
  ['electronics', ['electron', 'phone', 'computer', 'laptop', 'gadget']],
  ['furniture', ['furniture', 'sofa', 'bed', 'chair']],
  ['beauty', ['beauty', 'cosmetic', 'makeup', 'skincare', 'perfume', 'salon']],
  ['home_kitchen', ['home', 'kitchen', 'appliance', 'cookware', 'household']]
];

export const retailTemplateKey = value => {
  const text = String(value || '').toLowerCase();
  for (const [key, aliases] of typeAliases) {
    if (aliases.some(alias => text.includes(alias))) return key;
  }
  return text === 'retail' || text === 'product' || text === 'products' ? 'general' : 'general';
};

export const getRetailTemplate = value => retailTemplates[retailTemplateKey(value)] || retailTemplates.general;

export const getRetailCategoryNames = value => getRetailTemplate(value).categories.map(category => category.name);

export const cloneRetailTemplateCategories = value => getRetailTemplate(value).categories.map(category => ({
  name: category.name,
  icon: category.icon || iconForRetailLabel(category.name),
  subcategories: [...category.subcategories],
  subcategoryIcons: { ...(category.subcategoryIcons || {}) }
}));

export const categoryContextFromSettings = settings => {
  const templateCategories = Array.isArray(settings?.categoryTemplates) ? settings.categoryTemplates : [];
  const categories = templateCategories.length
    ? templateCategories
    : unique(settings?.categories || []).map(name => ({ name, subcategories: [] }));
  return categories
    .map(category => ({
      name: String(category?.name || '').trim(),
      icon: safeStoredIcon(category?.icon) || iconForRetailLabel(category?.name || ''),
      subcategories: unique(category?.subcategories || []),
      subcategoryIcons: {
        ...(category?.subcategoryIcons || {}),
        ...Object.fromEntries(unique(category?.subcategories || []).map(subcategory => [
          subcategory,
          safeStoredIcon(category?.subcategoryIcons?.[subcategory]) || iconForRetailLabel(subcategory)
        ]))
      }
    }))
    .filter(category => category.name);
};

export const formatCategoryContextForPrompt = categoryContext => {
  const categories = categoryContextFromSettings({ categoryTemplates: categoryContext });
  if (!categories.length) return 'No category list provided.';
  return categories
    .map(category => `- ${category.name}${category.subcategories.length ? `: ${category.subcategories.join(', ')}` : ''}`)
    .join('\n');
};

const eq = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

export const validateCategorySelection = (selection = {}, categoryContext = []) => {
  const categories = categoryContextFromSettings({ categoryTemplates: categoryContext });
  const selectedCategory = String(selection.selectedCategory || selection.category || '').trim();
  const selectedSubcategory = String(selection.selectedSubcategory || selection.subcategory || '').trim();
  const category = categories.find(item => eq(item.name, selectedCategory));
  if (!category) return { selectedCategory: '', selectedSubcategory: '' };
  if (!selectedSubcategory) return { selectedCategory: category.name, selectedSubcategory: '' };
  const subcategory = category.subcategories.find(item => eq(item, selectedSubcategory));
  return {
    selectedCategory: category.name,
    selectedSubcategory: subcategory || ''
  };
};
