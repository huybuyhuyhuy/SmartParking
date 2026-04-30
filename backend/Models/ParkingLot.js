export class ParkingLot {
  constructor({
    id,
    name,
    lat,
    lng,
    pricePerHour,
    evSupported,
    totalSlots,
    polygonGeoJson
  }) {
    this.id = id;
    this.name = name;
    this.lat = lat;
    this.lng = lng;
    this.pricePerHour = pricePerHour;
    this.evSupported = evSupported;
    this.totalSlots = totalSlots;
    this.polygonGeoJson = polygonGeoJson;
  }
}
