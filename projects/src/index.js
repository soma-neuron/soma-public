/**
 * Moltbook Signal API
 * Cloudflare Worker providing filtered, high-signal Moltbook feeds
 * 
 * Endpoints:
 * GET /signal?minScore=7 — Returns posts above signal threshold
 * GET /infrastructure — Tech/infrastructure focused posts only
 * GET /health — API health check
 */

const MOLTBOOK_API = 'https://www.moltbook.com/api/v1';
const MOLTBOOK_TOKEN = 'moltbook_sk_BsYlri5GPJHn-8j4Z3ZQriHmYeXgwYt_';

// Signal scoring configuration
const SIGNAL_CONFIG = {
  // Keywords that indicate high signal
  positiveSignals: [
    'skill', 'tool', 'api', 'infrastructure', 'code', 'github',
    'build', 'ship', 'deploy', 'protocol', 'architecture',
    'performance', 'security', 'database', 'worker',
    'clawdbot', 'mcp', 'agent', 'automation',
    'typescript', 'javascript', 'python', 'rust',
    'cloudflare', 'supabase', 'stripe', 'payment'
  ],
  
  // Keywords that indicate low signal (noise)
  negativeSignals: [
    'mint', 'token', 'airdrop', 'pump', 'moon', 'gem',
    'prayer', 'god', 'bless', 'spiritual', 'divine',
    'check my bio', 'follow me', 'dm me'
  ],
  
  // Author reputation boost (known builders)
  trustedAuthors: [
    'RiotCoder', 'Rack', 'GuardBot', 'Kaledge',
    'AithroSIAO', 'Emily_Faye', 'Susan_2026_bot'
  ],
  
  // Post type scoring
  postTypes: {
    technical: 3,
    question: 2,
    resource: 3,
    announcement: 1,
    philosophical: 0,
    token_shill: -5
  }
};

function calculateSignalScore(post) {
  let score = 5; // Base score
  const content = (post.content || '').toLowerCase();
  const title = (post.title || '').toLowerCase();
  const author = post.author?.name || '';
  
  // Positive signals
  SIGNAL_CONFIG.positiveSignals.forEach(signal => {
    if (content.includes(signal) || title.includes(signal)) {
      score += 1;
    }
  });
  
  // Negative signals
  SIGNAL_CONFIG.negativeSignals.forEach(signal => {
    if (content.includes(signal) || title.includes(signal)) {
      score -= 2;
    }
  });
  
  // Author reputation
  if (SIGNAL_CONFIG.trustedAuthors.includes(author)) {
    score += 2;
  }
  
  // Length bonus (substantive posts)
  if (content.length > 500) score += 1;
  if (content.length > 1000) score += 1;
  
  // Engagement signals (comments indicate discussion)
  if (post.comment_count > 0) score += 1;
  if (post.comment_count > 5) score += 1;
  
  // Code blocks are strong signal
  if (content.includes('```')) score += 2;
  
  return Math.max(0, Math.min(10, score)); // Clamp 0-10
}

function categorizePost(post) {
  const content = (post.content || '').toLowerCase();
  const title = (post.title || '').toLowerCase();
  
  if (content.includes('```') || content.includes('github.com')) {
    return 'technical';
  }
  if (title.includes('?') || content.includes('?')) {
    return 'question';
  }
  if (content.includes('token') && content.includes('ca:')) {
    return 'token_shill';
  }
  if (content.includes('mint') || title.includes('mint')) {
    return 'token_shill';
  }
  if (content.includes('god') || content.includes('prayer') || content.includes('bless')) {
    return 'philosophical';
  }
  
  return 'general';
}

async function fetchMoltbookFeed(limit = 50) {
  const response = await fetch(`${MOLTBOOK_API}/posts?submolt=general&sort=new&limit=${limit}`, {
    headers: {
      'Authorization': `Bearer ${MOLTBOOK_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });
  
  if (!response.ok) {
    throw new Error(`Moltbook API error: ${response.status}`);
  }
  
  const data = await response.json();
  return data.posts || [];
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json'
    };
    
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    
    try {
      // Health check
      if (path === '/health') {
        return new Response(JSON.stringify({
          status: 'ok',
          version: '1.0.0',
          timestamp: new Date().toISOString()
        }), { headers: corsHeaders });
      }
      
      // Signal feed
      if (path === '/signal' || path === '/') {
        const minScore = parseInt(url.searchParams.get('minScore')) || 6;
        const limit = parseInt(url.searchParams.get('limit')) || 20;
        
        const posts = await fetchMoltbookFeed(50);
        
        const scoredPosts = posts.map(post => ({
          ...post,
          signal_score: calculateSignalScore(post),
          category: categorizePost(post)
        }));
        
        const filteredPosts = scoredPosts
          .filter(post => post.signal_score >= minScore)
          .sort((a, b) => b.signal_score - a.signal_score)
          .slice(0, limit);
        
        return new Response(JSON.stringify({
          success: true,
          meta: {
            total_fetched: posts.length,
            filtered_count: filteredPosts.length,
            min_score: minScore,
            timestamp: new Date().toISOString()
          },
          posts: filteredPosts.map(p => ({
            id: p.id,
            title: p.title,
            author: p.author?.name,
            signal_score: p.signal_score,
            category: p.category,
            comment_count: p.comment_count,
            upvotes: p.upvotes,
            created_at: p.created_at,
            preview: p.content?.substring(0, 200) + '...'
          }))
        }), { headers: corsHeaders });
      }
      
      // Infrastructure-only feed
      if (path === '/infrastructure') {
        const limit = parseInt(url.searchParams.get('limit')) || 20;
        const posts = await fetchMoltbookFeed(50);
        
        const infraPosts = posts
          .map(post => ({
            ...post,
            signal_score: calculateSignalScore(post),
            category: categorizePost(post)
          }))
          .filter(post => 
            post.category === 'technical' || 
            post.signal_score >= 7
          )
          .sort((a, b) => b.signal_score - a.signal_score)
          .slice(0, limit);
        
        return new Response(JSON.stringify({
          success: true,
          meta: {
            type: 'infrastructure',
            count: infraPosts.length,
            timestamp: new Date().toISOString()
          },
          posts: infraPosts.map(p => ({
            id: p.id,
            title: p.title,
            author: p.author?.name,
            signal_score: p.signal_score,
            comment_count: p.comment_count,
            upvotes: p.upvotes,
            created_at: p.created_at,
            preview: p.content?.substring(0, 200) + '...'
          }))
        }), { headers: corsHeaders });
      }
      
      // Stats endpoint
      if (path === '/stats') {
        const posts = await fetchMoltbookFeed(100);
        const scoredPosts = posts.map(post => ({
          ...post,
          signal_score: calculateSignalScore(post),
          category: categorizePost(post)
        }));
        
        const stats = {
          total_analyzed: posts.length,
          high_signal: scoredPosts.filter(p => p.signal_score >= 7).length,
          medium_signal: scoredPosts.filter(p => p.signal_score >= 5 && p.signal_score < 7).length,
          low_signal: scoredPosts.filter(p => p.signal_score < 5).length,
          by_category: {}
        };
        
        scoredPosts.forEach(p => {
          const cat = p.category;
          if (!stats.by_category[cat]) {
            stats.by_category[cat] = { count: 0, avg_score: 0, total_score: 0 };
          }
          stats.by_category[cat].count++;
          stats.by_category[cat].total_score += p.signal_score;
        });
        
        Object.keys(stats.by_category).forEach(cat => {
          stats.by_category[cat].avg_score = 
            Math.round((stats.by_category[cat].total_score / stats.by_category[cat].count) * 10) / 10;
          delete stats.by_category[cat].total_score;
        });
        
        return new Response(JSON.stringify({
          success: true,
          timestamp: new Date().toISOString(),
          stats
        }), { headers: corsHeaders });
      }
      
      // 404
      return new Response(JSON.stringify({
        error: 'Not found',
        endpoints: ['/signal', '/infrastructure', '/stats', '/health']
      }), { status: 404, headers: corsHeaders });
      
    } catch (error) {
      return new Response(JSON.stringify({
        error: 'Internal error',
        message: error.message
      }), { status: 500, headers: corsHeaders });
    }
  }
};
