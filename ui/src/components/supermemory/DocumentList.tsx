// src/components/supermemory/DocumentList.tsx
// Add this to your GTM Engine UI to display Supermemory documents

'use client';

import { useEffect, useState } from 'react';

interface SupermemoryDocument {
  id: string;
  content: string;
  containerTag: string;
  metadata: {
    title?: string;
    type?: string;
    created_at?: string;
    [key: string]: any;
  };
}

export function SupermemoryDocumentList({ 
  containerTag,
  apiKey 
}: { 
  containerTag?: string;
  apiKey: string;
}) {
  const [documents, setDocuments] = useState<SupermemoryDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDocuments();
  }, [containerTag]);

  async function fetchDocuments() {
    try {
      const query = containerTag ? `container:${containerTag}` : '*';
      const res = await fetch(`https://api.supermemory.ai/v3/search?q=${encodeURIComponent(query)}`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await res.json();
      setDocuments(data.results || data || []);
    } catch (err) {
      console.error('Failed to fetch:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div>Loading documents...</div>;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">
        {containerTag ? `Documents: ${containerTag}` : 'All Documents'}
      </h2>
      
      {documents.length === 0 ? (
        <p className="text-gray-500">No documents found</p>
      ) : (
        <div className="grid gap-4">
          {documents.map((doc) => (
            <div key={doc.id} className="border rounded-lg p-4 bg-white shadow">
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-semibold text-lg">
                  {doc.metadata?.title || 'Untitled'}
                </h3>
                <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                  {doc.metadata?.type || 'document'}
                </span>
              </div>
              
              <p className="text-sm text-gray-500 mb-2">
                Container: {doc.containerTag}
              </p>
              
              <div className="prose prose-sm max-w-none">
                {/* Render first 200 chars of content */}
                <p className="text-gray-700">
                  {doc.content?.substring(0, 200)}...
                </p>
              </div>
              
              <div className="mt-3 text-xs text-gray-400">
                {doc.metadata?.created_at && 
                  new Date(doc.metadata.created_at).toLocaleDateString()
                }
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default SupermemoryDocumentList;
