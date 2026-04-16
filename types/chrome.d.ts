declare namespace chrome {
  namespace runtime {
    interface MessageSender {
      tab?: { id?: number };
      frameId?: number;
    }

    interface MessageEvent {
      addListener(
        callback: (
          message: any,
          sender: MessageSender,
          sendResponse: (response?: any) => void
        ) => void | boolean
      ): void;
    }

    const onMessage: MessageEvent;

    function sendMessage(message: any): Promise<any>;
    function getURL(path: string): string;
    function openOptionsPage(): Promise<void>;
  }

  namespace tabs {
    interface Tab {
      id?: number;
      url?: string;
      active?: boolean;
    }

    interface CreateProperties {
      url?: string;
    }

    function query(queryInfo: Record<string, any>): Promise<Tab[]>;
    function create(createProperties: CreateProperties): Promise<Tab>;
    function sendMessage(tabId: number, message: any): Promise<any>;
  }

  namespace storage {
    namespace local {
      function get(keys?: string | string[] | Record<string, any>): Promise<Record<string, any>>;
      function set(items: Record<string, any>): Promise<void>;
    }
  }
}

