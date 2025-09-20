/**
 * Base class for worker processes with MessagePort communication
 * Handles the worker side of the robust IPC pattern
 */

import { parentPort, MessagePort } from 'worker_threads';

export abstract class BaseWorker {
  private port: MessagePort | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.setupIPC();
  }

  /**
   * Setup IPC with parent process
   */
  private setupIPC(): void {
    // Handle initialization from utility process
    process.parentPort?.on('message', (e: Electron.MessageEvent) => {
      const message = e.data;
      
      if (message.type === 'init' && message.port) {
        this.port = message.port;
        this.setupPort();
      }
    });
  }

  /**
   * Setup MessagePort handlers
   */
  private setupPort(): void {
    if (!this.port) return;

    this.port.on('message', async (event) => {
      const message = event.data;

      try {
        // Handle different message types
        switch (message.type) {
          case 'request':
            await this.handleRequest(message);
            break;
          
          case 'message':
            await this.handleMessage(message);
            break;
          
          case 'heartbeat-ping':
            this.sendHeartbeat();
            break;
          
          case 'shutdown':
            await this.handleShutdown();
            break;
          
          default:
            console.warn(`[Worker] Unknown message type: ${message.type}`);
        }
      } catch (error) {
        console.error(`[Worker] Error handling message:`, error);
        
        if (message.id) {
          this.port!.postMessage({
            id: message.id,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    });

    this.port.start();
    
    // Send ready signal
    this.port.postMessage({ type: 'ready' });
    
    // Start heartbeat
    this.startHeartbeat();
    
    // Initialize the worker
    this.onInit();
  }

  /**
   * Handle request/response pattern
   */
  private async handleRequest(message: any): Promise<void> {
    const { id, method, data } = message;
    
    try {
      const result = await this.onRequest(method, data);
      
      this.port!.postMessage({
        id,
        data: result
      });
    } catch (error) {
      this.port!.postMessage({
        id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Handle one-way messages
   */
  private async handleMessage(message: any): Promise<void> {
    const { method, data } = message;
    await this.onMessage(method, data);
  }

  /**
   * Send heartbeat to parent
   */
  private sendHeartbeat(): void {
    this.port?.postMessage({ type: 'heartbeat' });
  }

  /**
   * Start heartbeat timer
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, 3000);
  }

  /**
   * Handle shutdown request
   */
  private async handleShutdown(): Promise<void> {
    console.log('[Worker] Shutting down...');
    
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    
    await this.onShutdown();
    
    process.exit(0);
  }

  /**
   * Send a message to parent
   */
  protected send(type: string, data: any): void {
    this.port?.postMessage({ type, data });
  }

  /**
   * Override in subclass - called when worker is initialized
   */
  protected abstract onInit(): void;

  /**
   * Override in subclass - handle request/response pattern
   */
  protected abstract onRequest(method: string, data: any): Promise<any>;

  /**
   * Override in subclass - handle one-way messages
   */
  protected abstract onMessage(method: string, data: any): Promise<void>;

  /**
   * Override in subclass - cleanup before shutdown
   */
  protected abstract onShutdown(): Promise<void>;
}