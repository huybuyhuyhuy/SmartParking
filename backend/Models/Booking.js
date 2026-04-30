export class Booking {
  constructor({ id, userId, parkingLotId, startedAt, endedAt, amount, qrCodeToken }) {
    this.id = id;
    this.userId = userId;
    this.parkingLotId = parkingLotId;
    this.startedAt = startedAt;
    this.endedAt = endedAt;
    this.amount = amount;
    this.qrCodeToken = qrCodeToken;
  }
}
