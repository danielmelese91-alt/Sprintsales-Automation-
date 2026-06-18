export const ETHIOPIA_PAYMENT_METHODS = [
  'Telebirr',
  'Commercial Bank of Ethiopia (CBE)',
  'Awash Bank',
  'Dashen Bank',
  'Bank of Abyssinia',
  'Cooperative Bank of Oromia',
  'Wegagen Bank',
  'Hibret Bank',
  'Nib International Bank',
  'Zemen Bank',
  'Oromia Bank',
  'Lion International Bank',
  'Bunna Bank',
  'Berhan Bank',
  'Abay Bank',
  'Addis International Bank',
  'Debub Global Bank',
  'Enat Bank',
  'Amhara Bank',
  'Goh Betoch Bank',
  'ZamZam Bank',
  'Hijra Bank',
  'Siinqee Bank',
  'Tsedey Bank',
  'Ahadu Bank',
  'Tsehay Bank',
  'Shabelle Bank',
  'Gadaa Bank',
  'Sidama Bank',
  'Rammis Bank',
  'Siket Bank',
  'Omo Bank',
  'Global Bank Ethiopia'
];

export const normalizePaymentOptions = value => {
  const allowed = new Set(ETHIOPIA_PAYMENT_METHODS);
  const rows = Array.isArray(value) ? value : [];
  return rows
    .map(row => ({
      method: String(row?.method || '').trim(),
      accountNumber: String(row?.accountNumber || '').trim().slice(0, 80),
      accountName: String(row?.accountName || '').trim().slice(0, 120)
    }))
    .filter(row => allowed.has(row.method) && row.accountNumber && row.accountName)
    .slice(0, 3);
};
