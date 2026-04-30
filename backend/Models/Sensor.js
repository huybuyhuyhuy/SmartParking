export class Sensor {
  constructor({ id, parkingLotId, apiKey, status }) {
    this.id = id;
    this.parkingLotId = parkingLotId;
    this.apiKey = apiKey;
    this.status = status;
  }
}
