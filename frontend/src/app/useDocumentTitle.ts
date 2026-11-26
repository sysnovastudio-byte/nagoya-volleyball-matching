import { useEffect } from 'react';

const SERVICE_NAME = 'サービス名（仮）';

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = `${title}｜${SERVICE_NAME}`;
  }, [title]);
}
