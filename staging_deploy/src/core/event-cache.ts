/**
 * EventCacheService
 * -----------------
 * Mantém um cache em memória dos eventos do Google Calendar.
 * O cache é populado na inicialização do servidor e renovado automaticamente
 * a cada 30 minutos, evitando chamadas desnecessárias à API do Google a cada request.
 */

export class EventCacheService {
    private cache: any[] = [];
    private lastUpdated: Date | null = null;
    private readonly INTERVAL_MS = 30 * 60 * 1000; // 30 minutos
    private timer: NodeJS.Timeout | null = null;
    private isRefreshing = false;

    constructor(private readonly fetchFn: () => Promise<any[]>) {}

    /**
     * Inicializa o cache: faz o primeiro fetch e agenda as renovações automáticas.
     */
    async init(): Promise<void> {
        console.log('[EventCache] Iniciando cache de eventos...');
        await this.refresh();
        this.timer = setInterval(async () => {
            console.log('[EventCache] Renovação automática do cache (30 min)...');
            await this.refresh();
        }, this.INTERVAL_MS);
        // Garante que o timer não impede o processo de encerrar
        if (this.timer.unref) this.timer.unref();
    }

    /**
     * Força um refresh imediato do cache buscando da fonte (Google Calendar API).
     * Se já houver um refresh em andamento, aguarda ele terminar.
     */
    async refresh(): Promise<void> {
        if (this.isRefreshing) {
            console.log('[EventCache] Refresh já em andamento, ignorando chamada duplicada.');
            return;
        }
        this.isRefreshing = true;
        try {
            const events = await this.fetchFn();
            this.cache = events;
            this.lastUpdated = new Date();
            console.log(`[EventCache] Cache atualizado: ${events.length} eventos carregados em ${this.lastUpdated.toLocaleTimeString('pt-BR')}.`);
        } catch (err: any) {
            console.error('[EventCache] Erro ao atualizar cache:', err.message);
            // Mantém o cache antigo em caso de erro
        } finally {
            this.isRefreshing = false;
        }
    }

    /**
     * Retorna os eventos do cache atual.
     */
    getEvents(): any[] {
        return this.cache;
    }

    /**
     * Atualiza um evento no cache local imediatamente, útil após chamadas PUT
     * para não depender da eventual consistência da API do Google.
     */
    updateLocalEvent(updatedEvent: any): void {
        const idx = this.cache.findIndex(e => e.id === updatedEvent.id);
        if (idx !== -1) {
            this.cache[idx] = { ...this.cache[idx], ...updatedEvent };
        } else {
            this.cache.push(updatedEvent);
        }
    }

    /**
     * Adiciona um evento novo ao cache local.
     */
    addLocalEvent(newEvent: any): void {
        if (!this.cache.find(e => e.id === newEvent.id)) {
            this.cache.push(newEvent);
        }
    }

    /**
     * Remove um evento deletado do cache local.
     */
    removeLocalEvent(eventId: string): void {
        this.cache = this.cache.filter(e => e.id !== eventId);
    }

    /**
     * Retorna o momento da última atualização do cache.
     */
    getLastUpdated(): Date | null {
        return this.lastUpdated;
    }

    /**
     * Para o timer de renovação automática (útil para testes ou shutdown controlado).
     */
    stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
            console.log('[EventCache] Timer de renovação parado.');
        }
    }
}
