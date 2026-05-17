import { Kafka, Partitioners } from "kafkajs";

const kafkaEnabled = !["0", "false", "off", "no"].includes(
  String(process.env.KAFKA_ENABLED ?? "false").toLowerCase()
);

const kafka = new Kafka({
  clientId: "smart-parking-hue",
  brokers: [(process.env.KAFKA_BROKER || "127.0.0.1:9092")]
});

export const producer = kafka.producer({
  createPartitioner: Partitioners.LegacyPartitioner
});

let connected = false;
export async function ensureKafkaProducer() {
  if (!kafkaEnabled) return false;
  if (!connected) {
    await producer.connect();
    connected = true;
  }
  return true;
}

export function isKafkaEnabled() {
  return kafkaEnabled;
}

export function isKafkaConnected() {
  return connected;
}
