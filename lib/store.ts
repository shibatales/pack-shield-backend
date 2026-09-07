import { Redis as UpstashRedis } from "@upstash/redis";
import { createClient } from "redis";
import { optionalEnv } from "./env.js";
import type { PinVerifier } from "./pin.js";
import { maskedPhone } from "./phone.js";

type NodeRedisClient = ReturnType<typeof createClient>;

interface RedisStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  sadd(key: string, value: string): Promise<void>;
  srem(key: string, value: string): Promise<void>;
  scard(key: string): Promise<number>;
  smembers(key: string): Promise<string[]>;
}

let redisStore: RedisStore | undefined;

export interface SponsorRecord {
  userId: string;
  sponsorPhone: string;
  sponsorName?: string;
  createdAt: string;
  updatedAt: string;
  inviteConsentGrantedAt?: string;
  inviteConsentVersion?: string;
  verificationStatus?: "pending" | "verified";
  verificationCodeVerifier?: PinVerifier;
  verificationCodeCreatedAt?: string;
  verifiedAt?: string;
  pinVerifier?: PinVerifier;
}

export interface UserPhoneRecord {
  userId: string;
  userPhone: string;
  createdAt: string;
  updatedAt: string;
  smsConsentGrantedAt?: string;
  smsConsentVersion?: string;
  verificationStatus?: "pending" | "verified";
  verificationCodeVerifier?: PinVerifier;
  verificationCodeCreatedAt?: string;
  verifiedAt?: string;
}

export interface PublicSponsorRecord {
  userId: string;
  sponsorPhone: string;
  sponsorName?: string;
  verificationStatus: "pending" | "verified";
  verifiedAt?: string;
  hasPin: boolean;
  pinUpdatedAt?: string;
  updatedAt: string;
}

export interface PublicUserPhoneRecord {
  userId: string;
  userPhone: string;
  verificationStatus: "pending" | "verified";
  verifiedAt?: string;
  updatedAt: string;
}

export type PackMemberSource = "install" | "handler" | "sponsor";

export interface PublicPackStats {
  joinedPackCount: number;
  handlerSetupCount: number;
  sponsorSetupCount: number;
  updatedAt: string;
}

export function redis(): RedisStore {
  redisStore ??= createRedisStore();
  return redisStore;
}

export async function getUserPhoneRecord(userId: string): Promise<UserPhoneRecord | null> {
  return redis().get<UserPhoneRecord>(userPhoneKey(userId));
}

export async function saveUserPhoneRecord(record: UserPhoneRecord): Promise<void> {
  await redis().set(userPhoneKey(record.userId), record);
}

export async function getSponsorRecord(userId: string): Promise<SponsorRecord | null> {
  return redis().get<SponsorRecord>(userSponsorKey(userId));
}

export async function saveSponsorRecord(
  record: SponsorRecord,
  previousSponsorPhone?: string
): Promise<void> {
  const client = redis();
  await client.set(userSponsorKey(record.userId), record);
  await client.sadd(sponsorUsersKey(record.sponsorPhone), record.userId);

  if (previousSponsorPhone && previousSponsorPhone !== record.sponsorPhone) {
    await client.srem(sponsorUsersKey(previousSponsorPhone), record.userId);
  }
}

export async function getUserIdsForSponsorPhone(phone: string): Promise<string[]> {
  return redis().smembers(sponsorUsersKey(phone));
}

export async function recordPackMember(
  userId: string,
  source: PackMemberSource
): Promise<PublicPackStats> {
  const client = redis();
  await client.sadd(packMembersKey(), userId);
  await client.sadd(packMembersBySourceKey(source), userId);
  return publicPackStats();
}

export async function publicPackStats(): Promise<PublicPackStats> {
  const client = redis();
  return {
    joinedPackCount: await client.scard(packMembersKey()),
    handlerSetupCount: await client.scard(packMembersBySourceKey("handler")),
    sponsorSetupCount: await client.scard(packMembersBySourceKey("sponsor")),
    updatedAt: new Date().toISOString()
  };
}

export function publicSponsorRecord(record: SponsorRecord): PublicSponsorRecord {
  return {
    userId: record.userId,
    sponsorPhone: maskedPhone(record.sponsorPhone),
    sponsorName: record.sponsorName,
    verificationStatus: sponsorVerificationStatus(record),
    verifiedAt: record.verifiedAt,
    hasPin: Boolean(record.pinVerifier),
    pinUpdatedAt: record.pinVerifier?.updatedAt,
    updatedAt: record.updatedAt
  };
}

export function publicUserPhoneRecord(record: UserPhoneRecord): PublicUserPhoneRecord {
  return {
    userId: record.userId,
    userPhone: maskedPhone(record.userPhone),
    verificationStatus: userPhoneVerificationStatus(record),
    verifiedAt: record.verifiedAt,
    updatedAt: record.updatedAt
  };
}

export function sponsorVerificationStatus(
  record: SponsorRecord
): "pending" | "verified" {
  return record.verificationStatus === "verified" ? "verified" : "pending";
}

export function userPhoneVerificationStatus(
  record: UserPhoneRecord
): "pending" | "verified" {
  return record.verificationStatus === "verified" ? "verified" : "pending";
}

function userPhoneKey(userId: string): string {
  return `user:${userId}:phone`;
}

export function userSponsorKey(userId: string): string {
  return `user:${userId}:sponsor`;
}

function sponsorUsersKey(phone: string): string {
  return `sponsor:${phone}:users`;
}

function packMembersKey(): string {
  return "stats:pack-members";
}

function packMembersBySourceKey(source: PackMemberSource): string {
  return `stats:pack-members:${source}`;
}

function createRedisStore(): RedisStore {
  const redisUrl = optionalEnv("REDIS_URL");
  if (redisUrl) {
    return new UrlRedisStore(redisUrl);
  }

  if (
    optionalEnv("UPSTASH_REDIS_REST_URL") &&
    optionalEnv("UPSTASH_REDIS_REST_TOKEN")
  ) {
    return new UpstashRedisStore(UpstashRedis.fromEnv());
  }

  throw new Error(
    "Missing Redis configuration. Set REDIS_URL, or set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN."
  );
}

class UrlRedisStore implements RedisStore {
  private client: NodeRedisClient | undefined;
  private connection: Promise<NodeRedisClient> | undefined;

  constructor(private readonly redisUrl: string) {}

  async get<T>(key: string): Promise<T | null> {
    const value = await (await this.connectedClient()).get(key);
    if (!value) {
      return null;
    }

    try {
      return JSON.parse(String(value)) as T;
    } catch {
      throw new Error(`Unreadable Redis JSON value at ${key}.`);
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    await (await this.connectedClient()).set(key, JSON.stringify(value));
  }

  async sadd(key: string, value: string): Promise<void> {
    await (await this.connectedClient()).sAdd(key, value);
  }

  async srem(key: string, value: string): Promise<void> {
    await (await this.connectedClient()).sRem(key, value);
  }

  async scard(key: string): Promise<number> {
    return (await this.connectedClient()).sCard(key);
  }

  async smembers(key: string): Promise<string[]> {
    return (await this.connectedClient()).sMembers(key);
  }

  private async connectedClient(): Promise<NodeRedisClient> {
    if (!this.client) {
      this.client = createClient({ url: this.redisUrl });
      this.client.on("error", (error) => {
        console.error("Redis client error", error);
      });
    }

    if (this.client.isOpen) {
      return this.client;
    }

    this.connection ??= this.client.connect().then(() => this.client!);

    try {
      return await this.connection;
    } catch (error) {
      this.connection = undefined;
      throw error;
    }
  }
}

class UpstashRedisStore implements RedisStore {
  constructor(private readonly client: UpstashRedis) {}

  async get<T>(key: string): Promise<T | null> {
    return this.client.get<T>(key);
  }

  async set<T>(key: string, value: T): Promise<void> {
    await this.client.set(key, value);
  }

  async sadd(key: string, value: string): Promise<void> {
    await this.client.sadd(key, value);
  }

  async srem(key: string, value: string): Promise<void> {
    await this.client.srem(key, value);
  }

  async scard(key: string): Promise<number> {
    return this.client.scard(key);
  }

  async smembers(key: string): Promise<string[]> {
    const members = await this.client.smembers(key);
    if (!Array.isArray(members)) {
      return [];
    }
    return members.map(String).filter(Boolean);
  }
}
