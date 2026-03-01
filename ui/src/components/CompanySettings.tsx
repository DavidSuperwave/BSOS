'use client';

import { useState } from 'react';
import { useApiData } from '@/lib/hooks';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Building2,
  Key,
  CheckCircle2,
  XCircle,
  Loader2,
  Eye,
  EyeOff,
  TestTube,
  Save,
  Plus,
  Trash2,
  AlertCircle,
} from 'lucide-react';

interface Company {
  id: string;
  name: string;
  slug: string;
  domain?: string;
  plusvibe_workspace_id?: string;
  plusvibe_api_key?: string;
  plusvibe_enabled?: boolean;
  integration_credentials?: Record<string, any>;
  created_at?: string;
}

export default function CompanySettingsPage() {
  const { data, error, isLoading, mutate } = useApiData<{ companies: Company[] }>('/api/companies');
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    plusvibe_workspace_id: '',
    plusvibe_api_key: '',
    plusvibe_enabled: false,
  });

  const companies = data?.companies || [];

  const handleEdit = (company: Company) => {
    const integrationCreds = company.integration_credentials || {};
    const plusvibeApiKey =
      integrationCreds.plusvibe_api_key || company.plusvibe_api_key || '';
    const plusvibeWorkspaceId =
      integrationCreds.plusvibe_workspace_id || company.plusvibe_workspace_id || '';
    setSelectedCompany(company);
    setFormData({
      name: company.name,
      plusvibe_workspace_id: plusvibeWorkspaceId,
      plusvibe_api_key: plusvibeApiKey,
      plusvibe_enabled: !!plusvibeApiKey,
    });
    setIsEditing(true);
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    if (!formData.plusvibe_api_key || !formData.plusvibe_workspace_id) {
      setTestResult({ success: false, message: 'API Key and Workspace ID are required' });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const response = await fetch('/api/plusvibe/campaigns?companyId=test', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        setTestResult({ success: true, message: 'Connection successful! Credentials are valid.' });
      } else {
        const error = await response.text();
        setTestResult({ success: false, message: `Connection failed: ${error}` });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: `Error: ${err.message}` });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    if (!selectedCompany) return;

    setIsSaving(true);
    const integrationCredentials = {
      ...(selectedCompany.integration_credentials || {}),
    };
    if (
      formData.plusvibe_enabled &&
      formData.plusvibe_api_key &&
      formData.plusvibe_workspace_id
    ) {
      integrationCredentials.plusvibe_api_key = formData.plusvibe_api_key;
      integrationCredentials.plusvibe_workspace_id = formData.plusvibe_workspace_id;
    } else {
      delete integrationCredentials.plusvibe_api_key;
      delete integrationCredentials.plusvibe_workspace_id;
    }

    try {
      const response = await fetch('/api/companies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedCompany.id,
          plusvibe_api_key: formData.plusvibe_api_key,
          plusvibe_workspace_id: formData.plusvibe_workspace_id,
          plusvibe_enabled: formData.plusvibe_enabled,
          integration_credentials: integrationCredentials,
        }),
      });

      if (response.ok) {
        mutate();
        setIsEditing(false);
        setSelectedCompany(null);
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to save');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red-500/30 bg-red-500/10">
        <CardContent className="p-6">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-6 w-6 text-red-400" />
            <p className="text-red-400">Failed to load companies</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Company Settings</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your companies and their PlusVibe campaign configurations.
        </p>
      </div>

      {/* Company List */}
      {!isEditing && (
        <div className="space-y-4">
          {companies.map((company) => (
            <Card key={company.id} className="hover:border-emerald-500/30 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                      <Building2 className="h-5 w-5 text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="font-medium text-foreground">{company.name}</h3>
                      <p className="text-sm text-muted-foreground">Slug: {company.slug}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {/* PlusVibe Status */}
                    <div className="flex items-center gap-2">
                      {company.plusvibe_enabled ? (
                        <>
                          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                            PlusVibe Enabled
                          </Badge>
                        </>
                      ) : (
                        <>
                          <XCircle className="h-4 w-4 text-muted-foreground" />
                          <Badge variant="secondary">PlusVibe Not Configured</Badge>
                        </>
                      )}
                    </div>

                    <Button variant="outline" size="sm" onClick={() => handleEdit(company)}>
                      Configure
                    </Button>
                  </div>
                </div>

                {/* PlusVibe Details */}
                {company.plusvibe_enabled && (
                  <div className="mt-4 pt-4 border-t border-border grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Workspace ID:</span>
                      <span className="ml-2 font-mono text-foreground">
                        {company.plusvibe_workspace_id}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">API Key:</span>
                      <span className="ml-2 font-mono text-foreground">
                        {company.plusvibe_api_key ? '••••••••' + company.plusvibe_api_key.slice(-8) : 'Not set'}
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}

          {companies.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-foreground">No companies yet</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Create your first company to get started.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Edit Form */}
      {isEditing && selectedCompany && (
        <Card>
          <CardHeader>
            <CardTitle>Configure PlusVibe for {selectedCompany.name}</CardTitle>
            <CardDescription>
              Set up project-level PlusVibe credentials. These will be used instead of global settings for this company.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Enable Toggle */}
            <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-muted/50">
              <div>
                <p className="font-medium text-foreground">Enable PlusVibe</p>
                <p className="text-sm text-muted-foreground">
                  Use project-specific credentials for this company
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.plusvibe_enabled}
                  onChange={(e) => setFormData({ ...formData, plusvibe_enabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-muted rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-foreground after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500" />
              </label>
            </div>

            {formData.plusvibe_enabled && (
              <>
                {/* Workspace ID */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    PlusVibe Workspace ID
                  </label>
                  <Input
                    placeholder="e.g., 678eb62a071ff7544034bcde"
                    value={formData.plusvibe_workspace_id}
                    onChange={(e) => setFormData({ ...formData, plusvibe_workspace_id: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Found in your PlusVibe workspace settings
                  </p>
                </div>

                {/* API Key */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    PlusVibe API Key
                  </label>
                  <div className="relative">
                    <Input
                      type={showApiKey ? 'text' : 'password'}
                      placeholder="e.g., 7332bc56-e2769fd4-9f1a00b6-ebb7ce28"
                      value={formData.plusvibe_api_key}
                      onChange={(e) => setFormData({ ...formData, plusvibe_api_key: e.target.value })}
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Your PlusVibe API key (keep this secure)
                  </p>
                </div>

                {/* Test Connection */}
                <div className="flex items-center gap-4">
                  <Button
                    variant="outline"
                    onClick={handleTestConnection}
                    disabled={isTesting}
                    className="gap-2"
                  >
                    {isTesting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <TestTube className="h-4 w-4" />
                    )}
                    Test Connection
                  </Button>

                  {testResult && (
                    <div className={`flex items-center gap-2 ${testResult.success ? 'text-emerald-400' : 'text-red-400'}`}>
                      {testResult.success ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <XCircle className="h-4 w-4" />
                      )}
                      <span className="text-sm">{testResult.message}</span>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Actions */}
            <div className="flex items-center gap-4 pt-4 border-t border-border">
              <Button onClick={handleSave} disabled={isSaving} className="gap-2">
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save Changes
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setIsEditing(false);
                  setSelectedCompany(null);
                  setTestResult(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
