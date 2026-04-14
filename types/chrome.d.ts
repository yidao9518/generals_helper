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
  }

  namespace tabs {
    interface Tab {
      id?: number;
    }

    function query(queryInfo: Record<string, any>): Promise<Tab[]>;
    function sendMessage(tabId: number, message: any): Promise<any>;
  }

  namespace storage {
    namespace local {
      function get(keys?: string | string[] | Record<string, any>): Promise<Record<string, any>>;
      function set(items: Record<string, any>): Promise<void>;
    }
  }
}

