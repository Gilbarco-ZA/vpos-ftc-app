import { CountryDataset } from './types'

export const TZ_DATASET: CountryDataset = {
  taxTypes: [
    {
      code: 'A',
      name: 'Standard VAT',
      description: 'Standard VAT rate',
      rate: 18,
      sortOrder: 1,
    },
    {
      code: 'E',
      name: 'Exempt',
      description: 'Exempt supplies',
      rate: 0,
      sortOrder: 2,
    },
  ],
  productClassCodes: [
    {
      code: 'FUEL',
      name: 'Fuel products',
      description: 'Petrol, diesel, kerosene',
      sortOrder: 1,
    },
    {
      code: 'LUBE',
      name: 'Lubricants',
      description: 'Oils and lubricants',
      sortOrder: 2,
    },
    {
      code: 'SERVICE',
      name: 'Services',
      description: 'Station services',
      sortOrder: 3,
    },
  ],
  productTypeCodes: [
    {
      code: 'PETROL',
      name: 'Petrol',
      description: 'Unleaded petrol',
      sortOrder: 1,
    },
    {
      code: 'DIESEL',
      name: 'Diesel',
      description: 'Automotive diesel',
      sortOrder: 2,
    },
    {
      code: 'KEROSENE',
      name: 'Kerosene',
      description: 'Kerosene',
      sortOrder: 3,
    },
  ],
  creditNoteReasons: [
    {
      code: 'RETURN',
      name: 'Returned goods',
      description: 'Customer return',
      sortOrder: 1,
    },
    {
      code: 'PRICE_ADJUSTMENT',
      name: 'Price adjustment',
      description: 'Pricing correction',
      sortOrder: 2,
    },
    {
      code: 'CANCELLED',
      name: 'Cancelled sale',
      description: 'Sale cancelled',
      sortOrder: 3,
    },
  ],
  packagingUnits: [
    {
      code: '1',
      name: '1 L',
      description: 'One litre pack',
      sortOrder: 1,
    },
    {
      code: '5',
      name: '5 L',
      description: 'Five litre pack',
      sortOrder: 2,
    },
    {
      code: '20',
      name: '20 L',
      description: 'Twenty litre pack',
      sortOrder: 3,
    },
  ],
  quantityUnits: [
    { code: 'L', name: 'Litres', description: 'Volume (L)', sortOrder: 1 },
    { code: 'KG', name: 'Kilograms', description: 'Weight (kg)', sortOrder: 2 },
    { code: 'PCS', name: 'Pieces', description: 'Count (pcs)', sortOrder: 3 },
  ],
}
