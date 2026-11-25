export const CATEGORIES = [
  { name: 'Food', emoji: '🍕', color: '#FF8A3D', tint: '#FFF1E6' },
  { name: 'Drinks', emoji: '🧋', color: '#B07A4F', tint: '#F7EDE4' },
  { name: 'Groceries', emoji: '🛒', color: '#2BBF6A', tint: '#E6F8EE' },
  { name: 'Clothing', emoji: '👕', color: '#FF6FB5', tint: '#FFEAF4' },
  { name: 'Shopping', emoji: '🛍️', color: '#E2458F', tint: '#FCE7F1' },
  { name: 'Transport', emoji: '🚕', color: '#F5B700', tint: '#FFF7D6' },
  { name: 'Travel', emoji: '✈️', color: '#3DA9F5', tint: '#E5F4FE' },
  { name: 'Stay', emoji: '🏨', color: '#6C7BFF', tint: '#ECEEFF' },
  { name: 'Fun', emoji: '🎉', color: '#9B7BFF', tint: '#F1ECFF' },
  { name: 'Service', emoji: '💈', color: '#14B8A6', tint: '#E3F7F5' },
  { name: 'Bills', emoji: '💡', color: '#64748B', tint: '#EEF1F5' },
  { name: 'Health', emoji: '💊', color: '#EF4444', tint: '#FDECEC' },
  { name: 'Other', emoji: '✨', color: '#A3A3A3', tint: '#F3F3F3' },
]

export const SETTLE = { name: 'Settle up', emoji: '🤝', color: '#16131C', tint: '#EFEDF3' }

export const catInfo = (name) => (name === 'Settle up' ? SETTLE : CATEGORIES.find((c) => c.name === name) || CATEGORIES[CATEGORIES.length - 1])
