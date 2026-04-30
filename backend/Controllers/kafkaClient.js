import { Kafka, Partitioners } from "kafkajs";

const kafka = new Kafka({
  clientId: "smart-parking-hue",
  brokers: [(process.env.KAFKA_BROKER || "127.0.0.1:9092")]
});

export const producer = kafka.producer({
  createPartitioner: Partitioners.LegacyPartitioner
});

let connected = false;
export async function ensureKafkaProducer() {
  if (!connected) {
    await producer.connect();
    connected = true;
  }
}
