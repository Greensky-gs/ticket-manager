import { User, Guild } from "discord.js";

export type ticket = {
    guild_id: string;
    channel_id: string;
    user_id: string;
    subject: string;
    state: 'open' | 'closed';
    id: number;
}
export type ticketCreate = {
    subject: string;
    user: User;
    guild: Guild;
}