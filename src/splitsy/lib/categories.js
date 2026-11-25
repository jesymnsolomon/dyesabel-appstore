export const CATEGORIES = [
  { name: 'Food', icon: 'pizza', color: '#FF8A3D', tint: '#FFF1E6' },
  { name: 'Drinks', icon: 'drink', color: '#B07A4F', tint: '#F7EDE4' },
  { name: 'Groceries', icon: 'cart', color: '#2BBF6A', tint: '#E6F8EE' },
  { name: 'Clothing', icon: 'shirt', color: '#FF6FB5', tint: '#FFEAF4' },
  { name: 'Shopping', icon: 'bag', color: '#E2458F', tint: '#FCE7F1' },
  { name: 'Transport', icon: 'taxi', color: '#F5B700', tint: '#FFF7D6' },
  { name: 'Travel', icon: 'plane', color: '#3DA9F5', tint: '#E5F4FE' },
  { name: 'Stay', icon: 'bed', color: '#6C7BFF', tint: '#ECEEFF' },
  { name: 'Fun', icon: 'party', color: '#9B7BFF', tint: '#F1ECFF' },
  { name: 'Service', icon: 'scissors', color: '#14B8A6', tint: '#E3F7F5' },
  { name: 'Bills', icon: 'bulb', color: '#64748B', tint: '#EEF1F5' },
  { name: 'Health', icon: 'pill', color: '#EF4444', tint: '#FDECEC' },
  { name: 'Other', icon: 'sparkles', color: '#A3A3A3', tint: '#F3F3F3' },
]

export const SETTLE = { name: 'Settle up', icon: 'handshake', color: '#16131C', tint: '#EFEDF3' }

export const catInfo = (name) => (name === 'Settle up' ? SETTLE : CATEGORIES.find((c) => c.name === name) || CATEGORIES[CATEGORIES.length - 1])
