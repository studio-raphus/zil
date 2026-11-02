// Shared app state. Places come from the catalog service, live text from the live
// service, community spots from the spots service.
export const state = {
  cats: {},          // id -> { label, one, color, icon }
  places: [],        // curated places, merged with live status
  spots: [],         // community spots visible to this device
  feed: [],          // live feed items
  filter: 'all',
  selectedId: null,
  addMode: false,
  offline: false
};

export const allPlaces = () => state.places.concat(state.spots);
export const byId = id => allPlaces().find(p => p.id === id);
export const catOf = p => state.cats[p.cat] || Object.values(state.cats)[0];
