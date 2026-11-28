// The paid calls on the site. Price is in naira.
export const PRODUCTS = {
  consult: {
    price: '100000.00', name: '1-hour growth consultation', short: '1-hour consultation',
    cal: 'https://cal.com/kokochidozie/1hourconsultation', page: '/consultation'
  },
  chat: {
    price: '30000.00', name: '15-minute chat', short: '15-min chat',
    cal: 'https://cal.com/kokochidozie/30min', page: '/chat'
  }
};
export const product = (k) => PRODUCTS[k] || PRODUCTS.consult;
