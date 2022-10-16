import { ChannelType, Client, Collection, TextChannel } from 'discord.js';
import { createConnection } from 'mysql';
import { dbType } from '../typings/db';
import { ticket, ticketClose, ticketCreate } from '../typings/ticket';

const database_infos = {
    host: process.env.DATABASE_H,
    user: process.env.DATABASE_U,
    database: process.env.DATABASE_D,
    password: process.env.DATABASE_P
};
export const db: dbType = createConnection(database_infos);
db.connect((error?: string) => {
    if (error) throw error;
});

export class TicketsManager {
    readonly client: Client;
    private cache: Collection<string, ticket> = new Collection();

    constructor(client: Client) {
        this.client = client;
    }
    public start() {
        this.fillCache();
    }
    public async createTicket({ guild, user, subject }: ticketCreate): Promise<ticket & { channel: TextChannel }> {
        return new Promise(async (resolve, reject) => {
            const channel = await guild.channels.create({
                name: this.generateTicketName(guild.id),
                topic: `Ticket of ${user.id}.\nSubject: ${subject}`,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    {
                        id: guild.id,
                        deny: ['ViewChannel']
                    },
                    {
                        id: user.id,
                        allow: ['ViewChannel', 'SendMessages', 'AttachFiles', 'AddReactions', 'EmbedLinks']
                    }
                ]
            });

            if (!channel) return reject('Error: channel not created');

            await this.query(`INSERT INTO tickets (guild_id, channel_id, user_id, subject, state) VALUES ('${guild.id}', '${channel.id}', '${user.id}', "${subject.replace(/"/g, '\\"')}", 'open')`);
            this.fillCache();
            return resolve({
                channel,
                channel_id: channel.id,
                guild_id: guild.id,
                user_id: user.id,
                state: 'closed',
                subject,
                id: this.getGreatestGlobalId() + 1
            });
        });
    }
    public async closeTicket({ guild, ticket_id }: ticketClose): Promise<ticket> {
        return new Promise(async(resolve, reject) => {
            if (!this.isTicket(ticket_id)) return reject('Not a ticket');
            const ticket = this.cache.get(ticket_id);

            if (ticket.state === 'closed') return reject('Ticket already closed');

            const channel = await guild.channels.fetch(ticket.channel_id) as TextChannel;
            if (!channel) return reject('No channel');

            await channel.permissionOverwrites.edit(ticket.user_id, {
                ViewChannel: false
            });
            ticket.state = 'closed';
            this.cache.set(ticket_id, ticket);
            await this.query(`UPDATE tickets SET state='closed' WHERE id='${ticket_id}'`);

            return resolve(ticket);
        });
    }
    public reopenTicket({ guild, ticket_id }: ticketClose): Promise<ticket> {
        return new Promise(async(resolve, reject) => {
            if (!this.isTicket(ticket_id)) return reject('Not a ticket');
            const ticket = this.cache.get(ticket_id);

            if (ticket.state === 'open') return reject('Ticket already opened');

            const channel = await guild.channels.fetch(ticket.channel_id) as TextChannel;
            if (!channel) return reject('No channel');

            await channel.permissionOverwrites.edit(ticket.user_id, {
                ViewChannel: true
            });
            ticket.state = 'open';
            this.cache.set(ticket_id, ticket);
            await this.query(`UPDATE tickets SET state='open' WHERE id='${ticket_id}'`);

            return resolve(ticket);
        });
    }
    public isTicket(id: string): boolean {
        return this.cache.has(id);
    }
    public getTicket(channel_id: string): boolean | ticket {
        const ticket = this.cache.find(x => x.channel_id === channel_id);
        if (!ticket) return false;

        return ticket;
    } 
    private async fillCache() {
        const data = await this.query('SELECT * FROM tickets');
        this.cache.clear();

        for (const d of data) {
            this.cache.set(d.id.toString(), d);
        };
    }
    private async query(sql: string): Promise<ticket[]> {
        return new Promise((resolve, reject) => {
            db.query(sql, (error, request) => {
                if (error) return reject(error);
                resolve(request as ticket[]);
            });
        });
    }
    private getGreatestId(guild_id: string): number {
        const cached = this.cache.filter(x => x.guild_id === guild_id);
        if (cached.size === 0) return 0;

        let greatest = cached.first()?.id as number;
        cached.forEach((x) => {
            greatest = Math.max(greatest, x.id);
        });
        return greatest;
    }
    private getGreatestGlobalId() {
        if (this.cache.size === 0) return 0;

        let greatest = this.cache.first().id;
        this.cache.forEach((x) => {
            greatest = Math.max(greatest, x.id);
        });

        return greatest;
    }
    private generateTicketName(guild_id: string) {
        const max = this.getGreatestId(guild_id);
        const numberOfZeros = 4 - max.toString().length;

        if (numberOfZeros === 0) return 'ticket-' + max;
        return 'ticket-' + new Array(numberOfZeros).fill('0').join('') + max;
    }
}