/**
 * PlusVibe API Client
 * Unified interface for PlusVibe workspace data
 */

const fetch = require('node-fetch');

class PlusVibeClient {
  constructor(apiKey, workspaceId) {
    this.apiKey = apiKey || process.env.PLUSVIBE_API_KEY;
    this.workspaceId = workspaceId || process.env.PLUSVIBE_WORKSPACE_ID || '678eb62a071ff7544034bcde';
    
    // Try multiple endpoints in order of preference
    this.endpoints = [
      'https://api.plusvibe.ai',
      'https://api.plusvibe.com',
      'https://app.plusvibe.ai/api'
    ];
  }

  /**
   * Test all endpoints and find working one
   */
  async findWorkingEndpoint() {
    for (const baseUrl of this.endpoints) {
      try {
        console.log(`   Testing endpoint: ${baseUrl}`);
        
        // Try with x-api-key header (v2 style)
        let response = await fetch(
          `${baseUrl}/api/v1/campaign/list?workspace_id=${this.workspaceId}`,
          { 
            headers: { 'x-api-key': this.apiKey },
            timeout: 5000
          }
        );
        
        if (response.ok) {
          console.log(`   ✅ Found working endpoint: ${baseUrl} (x-api-key)`);
          return { baseUrl, authType: 'x-api-key' };
        }
        
        // Try with Bearer token (v1 style)
        response = await fetch(
          `${baseUrl}/v1/workspaces/${this.workspaceId}/campaigns`,
          { 
            headers: { 'Authorization': `Bearer ${this.apiKey}` },
            timeout: 5000
          }
        );
        
        if (response.ok) {
          console.log(`   ✅ Found working endpoint: ${baseUrl} (Bearer)`);
          return { baseUrl, authType: 'bearer' };
        }
        
      } catch (error) {
        console.log(`   ❌ ${baseUrl} failed: ${error.message}`);
      }
    }
    
    throw new Error('No working PlusVibe endpoint found');
  }

  /**
   * Get all campaigns for workspace
   */
  async getCampaigns() {
    const { baseUrl, authType } = await this.findWorkingEndpoint();
    
    let url, headers;
    
    if (authType === 'x-api-key') {
      url = `${baseUrl}/api/v1/campaign/list?workspace_id=${this.workspaceId}`;
      headers = { 'x-api-key': this.apiKey };
    } else {
      url = `${baseUrl}/v1/workspaces/${this.workspaceId}/campaigns`;
      headers = { 'Authorization': `Bearer ${this.apiKey}` };
    }
    
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      throw new Error(`PlusVibe API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Normalize response format
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.data)) return data.data;
    if (data.campaigns) return data.campaigns;
    
    return [];
  }

  /**
   * Get campaign metrics
   */
  async getCampaignMetrics(campaignId) {
    const { baseUrl, authType } = await this.findWorkingEndpoint();
    
    let url, headers;
    
    if (authType === 'x-api-key') {
      url = `${baseUrl}/api/v1/campaign/${campaignId}/stats?workspace_id=${this.workspaceId}`;
      headers = { 'x-api-key': this.apiKey };
    } else {
      url = `${baseUrl}/v1/campaigns/${campaignId}/stats`;
      headers = { 'Authorization': `Bearer ${this.apiKey}` };
    }
    
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      throw new Error(`PlusVibe API error: ${response.status}`);
    }
    
    return await response.json();
  }

  /**
   * Get replies for a campaign
   */
  async getReplies(campaignId) {
    const { baseUrl, authType } = await this.findWorkingEndpoint();
    
    let url, headers;
    
    if (authType === 'x-api-key') {
      url = `${baseUrl}/api/v1/campaign/${campaignId}/replies?workspace_id=${this.workspaceId}`;
      headers = { 'x-api-key': this.apiKey };
    } else {
      url = `${baseUrl}/v1/campaigns/${campaignId}/replies`;
      headers = { 'Authorization': `Bearer ${this.apiKey}` };
    }
    
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      throw new Error(`PlusVibe API error: ${response.status}`);
    }
    
    const data = await response.json();
    return Array.isArray(data) ? data : (data.replies || []);
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const campaigns = await this.getCampaigns();
      return {
        status: 'healthy',
        campaigns: campaigns.length,
        endpoint: this.workingEndpoint || 'auto-detected'
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message
      };
    }
  }
}

module.exports = PlusVibeClient;
