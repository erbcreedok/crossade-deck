import { Room, Client } from "@colyseus/core";
import { registerInviteCode, releaseInviteCode } from "./inviteCodes.js";
import { guestIdentity } from "./sandboxNames.js";

export interface KitJoinOptions {
  accountId?: string;
  name?: string;
  seats?: number;
}

export interface KitRosterItem {
  seat: string | null;
  accountId?: string;
  name: string;
  away?: boolean;
}

export class KitRoom extends Room {
  private code = "";
  private maxSeats = 2;
  private rev = 0;
  private tree: unknown = null;
  private members: KitRosterItem[] = [];
  private clientMemberMap = new Map<string, KitRosterItem>();

  onCreate(options: KitJoinOptions = {}): void {
    if (typeof options?.seats === "number" && options.seats > 0) {
      this.maxSeats = Math.floor(options.seats);
    }
    this.code = registerInviteCode(this.roomId);
    this.setMetadata({ code: this.code });

    this.onMessage("hello", (client) => {
      const member = this.clientMemberMap.get(client.sessionId);
      if (!member) return;
      client.send("welcome", {
        you: {
          seat: member.seat,
          accountId: member.accountId,
          name: member.name,
        },
        code: this.code,
        roomId: this.roomId,
        rev: this.rev,
        tree: this.tree,
        roster: this.roster(),
      });
    });

    this.onMessage("set", (client, msg: { baseRev?: number; tree?: unknown }) => {
      if (!msg || typeof msg !== "object") return;
      const { baseRev, tree } = msg;
      if (typeof baseRev !== "number") return;
      if (typeof tree !== "object" || tree === null || typeof (tree as Record<string, unknown>).id !== "string") {
        return;
      }

      if (baseRev !== this.rev) {
        client.send("stale", { rev: this.rev, tree: this.tree });
        return;
      }

      this.rev += 1;
      this.tree = tree;
      const member = this.clientMemberMap.get(client.sessionId);
      const fromSeat = member ? member.seat : null;
      this.broadcast("tree", { rev: this.rev, tree: this.tree, from: fromSeat }, { except: client });
    });
  }

  onJoin(client: Client, options: KitJoinOptions = {}): void {
    if (options?.accountId) {
      const existing = this.members.find((m) => m.accountId === options.accountId);
      if (existing) {
        existing.away = false;
        if (typeof options.name === "string" && options.name.trim()) {
          existing.name = options.name.trim();
        }
        this.clientMemberMap.set(client.sessionId, existing);
        this.broadcastRoster();
        return;
      }
    }

    const named = typeof options?.name === "string" && options.name.trim() ? options.name.trim() : null;
    const guest = guestIdentity(client.sessionId);
    const memberName = named ?? guest.name;
    const seat = this.nextFreeSeat();

    const member: KitRosterItem = {
      seat,
      ...(options?.accountId ? { accountId: options.accountId } : {}),
      name: memberName,
    };

    this.members.push(member);
    this.clientMemberMap.set(client.sessionId, member);
    this.broadcastRoster();
  }

  async onLeave(client: Client, consented?: boolean): Promise<void> {
    const member = this.clientMemberMap.get(client.sessionId);
    if (!member) return;

    if (!member.accountId || consented) {
      this.removeMember(member);
      this.clientMemberMap.delete(client.sessionId);
      this.broadcastRoster();
      return;
    }

    member.away = true;
    this.broadcastRoster();

    try {
      await this.allowReconnection(client, 120);
      member.away = false;
      this.broadcastRoster();
    } catch {
      if (member.away && this.clientMemberMap.get(client.sessionId) === member) {
        this.removeMember(member);
        this.clientMemberMap.delete(client.sessionId);
        this.broadcastRoster();
      }
    }
  }

  onDispose(): void {
    releaseInviteCode(this.code);
  }

  private nextFreeSeat(): string | null {
    const takenSeats = new Set(this.members.map((m) => m.seat));
    for (let i = 1; i <= this.maxSeats; i++) {
      const seatName = `p${i}`;
      if (!takenSeats.has(seatName)) return seatName;
    }
    return null;
  }

  private removeMember(member: KitRosterItem): void {
    const idx = this.members.indexOf(member);
    if (idx !== -1) this.members.splice(idx, 1);
  }

  private roster(): KitRosterItem[] {
    return this.members.map((m) => ({
      seat: m.seat,
      ...(m.accountId ? { accountId: m.accountId } : {}),
      name: m.name,
      ...(m.away ? { away: true } : {}),
    }));
  }

  private broadcastRoster(): void {
    this.broadcast("roster", { roster: this.roster() });
  }
}
