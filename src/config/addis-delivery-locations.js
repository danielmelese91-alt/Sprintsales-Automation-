export const ADDIS_DELIVERY_LOCATIONS = [
  'Piassa',
  'Mexico',
  'Kazanchis',
  'Arat Killo',
  'Amist Killo',
  'Siddist Killo',
  'Churchill Road',
  'Legehar',
  'Stadium',
  'Meskel Square',
  'Bamis',
  'Filwoha',
  'Sengatera',
  'Teklehaimanot',
  'Sebategna',
  'Bole Atlas',
  'Bole Medhanialem',
  'Bole Rwanda',
  'Bole Bulbula',
  'Bole Arabsa',
  'Gerji',
  'Imperial',
  '22 Mazoria',
  'Hayahulet',
  'Haya Arat',
  'Megenagna',
  'Ayat',
  'CMC',
  'Summit',
  'Gurd Shola',
  'Salite Mihret',
  'Figa',
  'Jakros',
  'Egziabher Ab',
  'Unity Park Area',
  'Shola Market',
  'Kotebe',
  'Kara',
  'Ferensay Legasion',
  'Gurara',
  'Kebena',
  'Jan Meda',
  'Belay Zeleke',
  'Shiromeda',
  'Entoto',
  'Gullele',
  'Kechene',
  'Wingate',
  'Addisu Gebeya',
  'Semen Mazoria',
  'Lideta',
  'Abnet',
  'Geja Sefer',
  'Kocher',
  'Tor Hailoch',
  'Keraniyo',
  'Bethel',
  'Ayer Tena',
  'Kolfe',
  'Total',
  'Zenebework',
  'Alem Bank',
  'Repi',
  'Koshe',
  'Karakore',
  'Saris',
  'Saris Abo',
  'Gotera',
  'Kera',
  'Bulgaria',
  'Bisrate Gabriel',
  'Old Airport',
  'Mekanisa',
  'Jemo 1',
  'Jemo 2',
  'Jemo 3',
  'Lebu',
  'Mebrat Hail',
  'Hana Mariam',
  'Lafto',
  'Gofa Camp',
  'Gofa Gabriel',
  'Kality',
  'Gelan',
  'Tulu Dimtu',
  'Akaki',
  'Sari-Addis',
  'Bulbula Lemi',
  'Furi',
  'Sebeta Road',
  'Sululta Road',
  'Burayu Area',
  'Legedadi Area',
  'Sendafa Road',
  'Dukem Road',
  'Merkato',
  'Raguel',
  'Bomb Tera',
  'Dubai Tera',
  'Ehil Berenda'
];

export const normalizeDeliveryArea = value => String(value || '')
  .toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .replace(/\s+/g, ' ');

export const normalizeDeliveryZones = value => {
  const allowedByKey = new Map(ADDIS_DELIVERY_LOCATIONS.map(area => [normalizeDeliveryArea(area), area]));
  const rows = Array.isArray(value) ? value : [];
  const seen = new Set();
  return rows
    .map(row => {
      const key = normalizeDeliveryArea(row?.area || row?.name);
      const area = allowedByKey.get(key);
      if (!area || seen.has(area)) return null;
      seen.add(area);
      return {
        area,
        fee: Math.max(0, Math.min(99999, Number(row?.fee || 0))),
        maxHours: Math.max(1, Math.min(168, Number(row?.maxHours || 24))),
        enabled: row?.enabled !== false
      };
    })
    .filter(Boolean);
};
