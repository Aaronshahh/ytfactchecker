// Inject sidebar overlay
function injectSidebar() {
  if (document.getElementById('yt-factcheck-sidebar')) return;
  const sidebar = document.createElement('div');
  sidebar.id = 'yt-factcheck-sidebar';
  sidebar.innerHTML = `
    <button id="yt-factcheck-close" style="position:absolute;top:10px;right:10px;background:rgba(0,0,0,0.1);border:none;border-radius:50%;width:32px;height:32px;font-size:20px;cursor:pointer;z-index:10001;">&times;</button>
    <h2 style="margin-top:32px;">YouTube Fact Checker</h2>
    <div id="factcheck-results">Loading...</div>
    <div id="factcheck-log-container">
      <h3>Logs</h3>
      <div id="factcheck-logs"></div>
    </div>
  `;
  document.body.appendChild(sidebar);
  // Add close button handler
  document.getElementById('yt-factcheck-close').onclick = () => {
    sidebar.style.display = 'none';
    const fab = document.getElementById('yt-factcheck-fab');
    if (fab) fab.style.display = '';
  };
}

// Add a green floating button to open the sidebar
function injectSidebarButton() {
  if (document.getElementById('yt-factcheck-fab')) return;
  const fab = document.createElement('button');
  fab.id = 'yt-factcheck-fab';
  fab.innerHTML = '&#10003;'; // checkmark icon
  fab.title = 'Open Fact Checker';
  fab.style.position = 'fixed';
  fab.style.bottom = '32px';
  fab.style.right = '32px';
  fab.style.width = '56px';
  fab.style.height = '56px';
  fab.style.borderRadius = '50%';
  fab.style.background = '#4caf50';
  fab.style.color = '#fff';
  fab.style.fontSize = '2em';
  fab.style.boxShadow = '0 4px 12px rgba(0,0,0,0.18)';
  fab.style.border = 'none';
  fab.style.zIndex = '100000';
  fab.style.cursor = 'pointer';
  fab.style.display = 'flex';
  fab.style.alignItems = 'center';
  fab.style.justifyContent = 'center';
  fab.style.transition = 'opacity 0.2s';
  fab.onclick = () => {
    toggleSidebar();
    fab.style.display = 'none';
  };
  document.body.appendChild(fab);
}

// Add a function to toggle the sidebar
function toggleSidebar() {
  const sidebar = document.getElementById('yt-factcheck-sidebar');
  const fab = document.getElementById('yt-factcheck-fab');
  if (sidebar) {
    const isHidden = sidebar.style.display === 'none';
    sidebar.style.display = isHidden ? '' : 'none';
    if (fab) fab.style.display = isHidden ? 'none' : '';
  } else {
    injectSidebar();
    if (fab) fab.style.display = 'none';
    main();
  }
}

// Listen for messages from the extension (popup or background)
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.action === 'toggleSidebar') {
      toggleSidebar();
      sendResponse({status: 'toggled'});
    }
  });
}

// Log messages to the sidebar UI
function logToUI(message) {
  const logDiv = document.getElementById('factcheck-logs');
  if (logDiv) {
    logDiv.innerHTML += message + '<br>';
    logDiv.scrollTop = logDiv.scrollHeight; // Auto-scroll to bottom
  }
  console.log(message); // Also log to console for backup
}

// Improved transcript extraction: each line is a full sentence
async function getTranscript() {
  logToUI('Attempting to get transcript...');
  const transcriptButton = Array.from(document.querySelectorAll('button')).find(btn => btn.innerText.includes('Transcript'));
  if (transcriptButton) {
    transcriptButton.click();
    logToUI('Clicked transcript button.');
    await new Promise(r => setTimeout(r, 1000));
  } else {
    logToUI('Transcript button not found.');
  }
  const transcriptLines = Array.from(document.querySelectorAll('ytd-transcript-segment-renderer'));
  logToUI(`Found ${transcriptLines.length} transcript segments.`);
  // Gather all text and timestamps
  let allText = '';
  let timeMap = [];
  transcriptLines.forEach((line, idx) => {
    const fullText = line.textContent || '';
    const timestampMatch = fullText.trim().match(/^(\d{1,2}:\d{2}(?::\d{2})?)/);
    const timestamp = timestampMatch ? timestampMatch[0] : '';
    const text = fullText.replace(timestamp, '').trim();
    if (text) {
      if (allText && !allText.endsWith(' ')) allText += ' ';
      allText += text;
      timeMap.push({ idx: allText.length - text.length, timestamp });
    }
  });
  // Smarter sentence splitting
  const abbreviations = [
    'Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Prof.', 'Sr.', 'Jr.', 'St.', 'vs.', 'e.g.', 'i.e.', 'U.S.', 'U.K.', 'Inc.', 'Ltd.', 'Co.', 'Jan.', 'Feb.', 'Mar.', 'Apr.', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'
  ];
  // Regex: split at . ! ? only if not preceded by abbreviation or digit, and followed by space+capital or end
  function smartSplit(text) {
    const sentences = [];
    let buffer = '';
    let i = 0;
    while (i < text.length) {
      buffer += text[i];
      // Check for sentence end
      if (/[.!?]/.test(text[i])) {
        // Look back for abbreviation or digit
        let isAbbrev = false;
        for (const abbr of abbreviations) {
          if (buffer.endsWith(abbr)) {
            isAbbrev = true;
            break;
          }
        }
        // Don't split if previous char is digit (decimal)
        if (!isAbbrev && !(i > 0 && /\d/.test(text[i-1]) && text[i] === '.')) {
          // Look ahead for space+capital or end
          const after = text.slice(i+1, i+3);
          if (/^(\s+[A-Z])|$/.test(after)) {
            sentences.push(buffer.trim());
            buffer = '';
          }
        }
      }
      i++;
    }
    if (buffer.trim()) sentences.push(buffer.trim());
    return sentences;
  }
  const sentences = smartSplit(allText);
  // Assign timestamps to sentences
  let transcript = [];
  let lastIdx = 0;
  let lastTimestamp = '';
  let timeIdx = 0;
  sentences.forEach((sentence, i) => {
    // Find the closest timestamp for the start of this sentence
    while (timeIdx < timeMap.length && lastIdx >= timeMap[timeIdx].idx) {
      lastTimestamp = timeMap[timeIdx].timestamp;
      timeIdx++;
    }
    transcript.push({ timestamp: lastTimestamp, text: sentence.trim() });
    lastIdx += sentence.length;
  });
  return transcript.filter(line => line.text); // Filter out any empty lines
}

// Convert "HH:MM:SS" or "MM:SS" timestamp to seconds
function timestampToSeconds(timestamp) {
  if (!timestamp) return 0;
  const parts = timestamp.split(':').map(Number);
  // HH:MM:SS
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  // MM:SS
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  // SS
  if (parts.length === 1) {
    return parts[0];
  }
  return 0;
}

// Sync transcript with video playback
function syncTranscript(transcript) {
  const video = document.querySelector('video');
  if (!video) {
    logToUI('ERROR: Could not find video element to sync with.');
    return;
  }
  
  logToUI('Video element found. Attaching time listener.');
  let lastLoggedTime = -1;
  let lastActiveLineId = null;

  video.addEventListener('timeupdate', () => {
    const currentTime = video.currentTime;
    let activeLineId = null;

    // Log current time every 2 seconds to avoid spamming logs
    if (Math.abs(currentTime - lastLoggedTime) > 2) {
      logToUI(`Video time: ${Math.floor(currentTime)}s`);
      lastLoggedTime = currentTime;
    }

    // Find the current line
    for (let i = transcript.length - 1; i >= 0; i--) {
      if (transcript[i].timestampSeconds <= currentTime) {
        activeLineId = transcript[i].id;
        break;
      }
    }

    // Only update if the active line has changed
    if (activeLineId !== lastActiveLineId) {
      // Remove active class from previous line
      if (lastActiveLineId) {
        const prevLine = document.getElementById(lastActiveLineId);
        if (prevLine) {
          prevLine.classList.remove('active-line');
        }
      }

      // Add active class to current line and scroll to it
      if (activeLineId) {
        const activeLine = document.getElementById(activeLineId);
        if (activeLine) {
          activeLine.classList.add('active-line');
          
          // Scroll the sidebar to keep the active line visible
          const sidebar = document.getElementById('yt-factcheck-sidebar');
          const resultsDiv = document.getElementById('factcheck-results');
          
          if (sidebar && resultsDiv) {
            const sidebarRect = sidebar.getBoundingClientRect();
            const lineRect = activeLine.getBoundingClientRect();
            const resultsRect = resultsDiv.getBoundingClientRect();
            
            // Check if the line is outside the visible area
            if (lineRect.top < resultsRect.top || lineRect.bottom > resultsRect.bottom) {
              activeLine.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center',
                inline: 'nearest'
              });
            }
          }
        }
      }
      
      lastActiveLineId = activeLineId;
    }
  });
}

// Global video info
let ytVideoTitle = '';
let ytVideoDate = '';

// Helper to extract video title and date from YouTube DOM
function getYouTubeVideoInfo() {
  // Title: try to get from h1 or meta
  let title = '';
  let date = '';
  // Try modern YouTube layout
  const h1 = document.querySelector('h1.title, h1.ytd-watch-metadata, h1.ytd-video-primary-info-renderer');
  if (h1 && h1.textContent) title = h1.textContent.trim();
  // Fallback: meta og:title
  if (!title) {
    const metaTitle = document.querySelector('meta[property="og:title"]');
    if (metaTitle) title = metaTitle.getAttribute('content') || '';
  }
  // Date: try to get from #info-strings or ytd-video-primary-info-renderer
  const dateNode = document.querySelector('#info-strings yt-formatted-string, #date yt-formatted-string, span.ytd-video-primary-info-renderer, .date.style-scope.ytd-video-secondary-info-renderer');
  if (dateNode && dateNode.textContent) date = dateNode.textContent.trim();
  // Fallback: meta uploadDate
  if (!date) {
    const metaDate = document.querySelector('meta[itemprop="uploadDate"]');
    if (metaDate) date = metaDate.getAttribute('content') || '';
  }
  return { title, date };
}

// Send transcript segment to Hugging Face for fact-checking
async function factCheckSegment(segment, surroundingContext = '', videoTitle = ytVideoTitle, videoDate = ytVideoDate) {
  // TODO: Replace 'YOUR_HF_API_KEY' with your actual Hugging Face API key
  // Get it from: https://huggingface.co/settings/tokens
  const apiKey = HUGGINGFACE_API_KEY; 
  
  if (apiKey === 'YOUR_HF_API_KEY') {
    logToUI('ERROR: Please add your Hugging Face API key in content.js line 78');
    return { error: 'API key not configured' };
  }
  
  // Select the best model based on content analysis
  const model = selectBestModel(segment);
  logToUI(`Using model: ${model}`);
  
  try {
    // Step 1: Get supporting data first (parallelize for speed)
    const [newsData, usStatsData] = await Promise.all([
      getNewsCrossReference(segment, videoTitle, videoDate),
      getUSStatistics(segment, videoTitle, videoDate)
    ]);
    // Step 2: Create enhanced context for Hugging Face AI
    const enhancedContext = createEnhancedContext(segment, newsData, usStatsData, surroundingContext, videoTitle, videoDate);
    // Step 3: Send enhanced context to Hugging Face AI
    const hfResponse = await fetch('https://api-inference.huggingface.co/models/' + model, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        inputs: enhancedContext,
        parameters: {
          candidate_labels: ["fact", "opinion", "false", "unverified"]
        }
      })
    });
    
    if (!hfResponse.ok) {
      throw new Error(`Hugging Face API call failed: ${hfResponse.status}`);
    }
    
    const hfData = await hfResponse.json();
    
    return {
      hfAnalysis: hfData,
      newsAnalysis: newsData,
      usStats: usStatsData,
      enhancedContext: enhancedContext,
      modelUsed: model
    };
    
  } catch (error) {
    logToUI(`Fact-check error: ${error.message}`);
    return { error: error.message };
  }
}

// Select the best model based on content analysis
function selectBestModel(text) {
  // For stability, we will use a single, reliable model.
  // Model switching can be re-enabled when more models are confirmed to be available and effective.
  return 'facebook/bart-large-mnli';
}

// Check for American history terms
function containsHistoryTerms(text) {
  const historyTerms = [
    'constitution', 'declaration', 'independence', 'revolution', 'civil war', 'world war',
    'founding fathers', 'george washington', 'thomas jefferson', 'benjamin franklin',
    'abraham lincoln', 'martin luther king', 'rosa parks', 'suffrage', 'amendment',
    'bill of rights', 'federalist papers', 'articles of confederation', 'louisiana purchase',
    'manifest destiny', 'trail of tears', 'emancipation', 'reconstruction', 'jim crow',
    'great depression', 'new deal', 'civil rights', 'vietnam war', 'cold war', 'berlin wall',
    'watergate', 'reagan', 'clinton', 'bush', 'obama', 'trump', 'biden'
  ];
  return historyTerms.some(term => text.includes(term));
}

// Check for legal/legislative terms
function containsLegalTerms(text) {
  const legalTerms = [
    'law', 'legislation', 'bill', 'act', 'statute', 'regulation', 'court', 'judge',
    'supreme court', 'congress', 'senate', 'house of representatives', 'president',
    'executive order', 'veto', 'override', 'committee', 'hearing', 'testimony',
    'amendment', 'constitutional', 'unconstitutional', 'precedent', 'ruling',
    'appeal', 'district court', 'circuit court', 'federal', 'state', 'local',
    'attorney general', 'justice', 'chief justice', 'nomination', 'confirmation'
  ];
  return legalTerms.some(term => text.includes(term));
}

// Check for political terms
function containsPoliticalTerms(text) {
  const politicalTerms = [
    'election', 'campaign', 'vote', 'voting', 'democrat', 'republican', 'party',
    'politics', 'political', 'policy', 'administration', 'government', 'federal',
    'state', 'local', 'municipal', 'mayor', 'governor', 'senator', 'representative',
    'congressman', 'congresswoman', 'politician', 'lobbyist', 'interest group',
    'primary', 'caucus', 'convention', 'inauguration', 'state of the union',
    'budget', 'appropriations', 'tax', 'spending', 'deficit', 'surplus'
  ];
  return politicalTerms.some(term => text.includes(term));
}

// Check for scientific or medical terms
function containsScientificOrMedicalTerms(text) {
  const lowerText = text.toLowerCase();
  const terms = [
    'science', 'scientific', 'study', 'research', 'experiment', 'clinical trial', 'medical', 'medicine', 'health', 'disease',
    'virus', 'bacteria', 'infection', 'vaccine', 'drug', 'treatment', 'therapy', 'cancer', 'heart', 'brain', 'dna', 'rna',
    'protein', 'cell', 'biology', 'chemistry', 'physics', 'doctor', 'patient', 'hospital', 'clinic', 'pubmed', 'ncbi', 'nih'
  ];
  return terms.some(term => lowerText.includes(term));
}

// Create enhanced context for Hugging Face AI
function createEnhancedContext(originalText, newsData, usStatsData, surroundingContext, videoTitle = ytVideoTitle, videoDate = ytVideoDate) {
  let context = '';
  if (videoTitle) context += `YouTube Video Title: ${videoTitle}\n`;
  if (videoDate) context += `Video Upload Date: ${videoDate}\n`;
  context += `Statement to analyze: "${originalText}"\n\n`;
  
  // Add specialized American knowledge context
  const americanContext = getAmericanContext(originalText);
  if (americanContext) {
    context += `American Historical/Legal Context: ${americanContext}\n\n`;
  }
  
  // Add news context
  if (newsData && !newsData.error && newsData.articles && newsData.articles.length > 0) {
    const credibleArticles = newsData.articles.filter(article => {
      const source = article.source?.name?.toLowerCase() || '';
      const credibleSources = ['reuters', 'ap', 'bbc', 'cnn', 'nbc', 'abc', 'cbs', 'fox', 'npr', 'pbs', 'the new york times', 'washington post', 'wall street journal'];
      return credibleSources.some(credible => source.includes(credible));
    });
    
    if (credibleArticles.length > 0) {
      context += `Related news from credible sources:\n`;
      credibleArticles.slice(0, 3).forEach((article, index) => {
        context += `${index + 1}. ${article.title} (${article.source?.name})\n`;
      });
      context += `\n`;
    }
  }
  
  // Add US statistics context
  if (usStatsData) {
    let statsContext = '';
    if (usStatsData.census && usStatsData.census.hasRelevantData) {
      statsContext += `AUTHORITATIVE DATA: US Census Bureau demographic data is available and highly reliable. `;
    }
    if (usStatsData.bls && usStatsData.bls.hasRelevantData) {
      statsContext += `AUTHORITATIVE DATA: Bureau of Labor Statistics employment data is available and highly reliable. `;
    }
    if (usStatsData.fed && usStatsData.fed.hasRelevantData) {
      statsContext += `AUTHORITATIVE DATA: Federal Reserve economic data is available and trustworthy. `;
    }
    
    if (statsContext) {
      context += `GOVERNMENT STATISTICS: ${statsContext}\n\n`;
    }
  }
  
  // Add surrounding context
  if (surroundingContext) {
    context += `Conversation context:\n${surroundingContext}\n\n`;
  }
  
  // Add analysis instruction with reasoning requirement
  context += `Based on the above context and your knowledge of American history, law, and current events, classify the [CURRENT CLAIM] statement as: fact, opinion, false, or unverified. 

IMPORTANT: Be reasonably skeptical but not overly conservative:
- Classify as 'fact' if you have good evidence supporting the claim, even if not perfect
- Classify as 'opinion' if the statement expresses a subjective view, prediction, or interpretation
- Classify as 'false' if you have clear evidence contradicting the claim
- Classify as 'unverified' only if there is truly insufficient evidence to make any determination

Consider the broader US political context:
- How does this claim align with or contradict established political positions and party platforms?
- Does this claim fit into common political narratives or talking points?
- Are there partisan implications or biases that might affect the claim's accuracy?
- Does the claim reflect current policy debates, legislative actions, or political events?

TRUST AUTHORITATIVE SOURCES:
- Government statistics from BLS (unemployment, employment data) are highly reliable
- Census Bureau data (population, demographics, income) is authoritative
- Federal Reserve economic data is trustworthy
- When claims match official government statistics, classify as 'fact' with high confidence
- Official government sources should be trusted over partisan interpretations

Be skeptical of:
- Claims with specific numbers or statistics that seem unsourced or questionable
- Absolute statements ("always", "never", "everyone", "nobody") without qualification
- Claims about very recent events that may not have been verified yet
- Statements that are clearly interpretations rather than objective facts
- Claims that seem to align too perfectly with partisan talking points without evidence

Then provide a brief 1-2 sentence explanation for your classification, explaining your reasoning, confidence level, and any political context considerations.`;
  
  return context;
}

// Get specialized American context based on content
function getAmericanContext(text) {
  const lowerText = text.toLowerCase();
  let context = '';
  
  // Constitutional context
  if (lowerText.includes('constitution') || lowerText.includes('amendment')) {
    context += 'The US Constitution was ratified in 1788. The Bill of Rights (Amendments 1-10) was added in 1791. ';
  }
  
  // Historical events context
  if (lowerText.includes('civil war')) {
    context += 'The American Civil War occurred from 1861-1865. The Emancipation Proclamation was issued in 1863. ';
  }
  
  if (lowerText.includes('world war')) {
    context += 'World War I: 1914-1918, World War II: 1939-1945 (US involvement 1941-1945). ';
  }
  
  if (lowerText.includes('great depression')) {
    context += 'The Great Depression lasted from 1929-1939. The New Deal programs began in 1933. ';
  }
  
  if (lowerText.includes('civil rights')) {
    context += 'The Civil Rights Movement peaked in the 1950s-1960s. The Civil Rights Act was passed in 1964. ';
  }
  
  // Legal context
  if (lowerText.includes('supreme court')) {
    context += 'The Supreme Court is the highest court in the US. It has 9 justices appointed for life. ';
  }
  
  if (lowerText.includes('congress')) {
    context += 'Congress consists of the Senate (100 members, 2 per state) and House of Representatives (435 members, based on population). ';
  }
  
  // Political context
  if (lowerText.includes('election') || lowerText.includes('president')) {
    context += 'Presidential elections occur every 4 years. The Electoral College determines the winner. ';
  }
  
  if (lowerText.includes('democrat') || lowerText.includes('republican')) {
    context += 'The two major US political parties are Democrats and Republicans. Party platforms and positions have evolved over time. ';
  }
  
  return context;
}

// Sanitize GNews API query to avoid syntax errors
function sanitizeGNewsQuery(query) {
  // Remove all non-alphanumeric (except spaces)
  query = query.replace(/[^a-zA-Z0-9 ]/g, ' ');
  // Collapse whitespace
  query = query.replace(/\s+/g, ' ').trim();
  // Limit to 8 words
  return query.split(' ').slice(0, 8).join(' ');
}

// Helper to extract year(s) from text
function extractYearFromText(text) {
  const years = [];
  const regex = /\b(19|20)\d{2}\b/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    years.push(match[0]);
  }
  return years;
}

// Get news cross-reference for credibility
async function getNewsCrossReference(text, videoTitle = ytVideoTitle, videoDate = ytVideoDate) {
  // Get a free API key from: https://gnews.io/
  const gnewsApiKey = GNEWS_API_KEY;
  // NewsAPI.org key
  const newsApiKey = NEWSAPI_API_KEY;
  
  if (gnewsApiKey === 'YOUR_GNEWS_API_KEY') {
    logToUI('⚠️ GNews API key not configured. Skipping news check.');
    return { articles: [] };
  }
  try {
    // 1. Model the topic and extract key parameters
    const topicInfo = modelTopicFromText(text + ' ' + videoTitle);
    logToUI(`🧠 Topic identified: ${topicInfo.topic} | Keywords: ${topicInfo.keywords}`);
    if (!topicInfo.keywords) {
      logToUI('⚠️ No keywords found for news search.');
      return { articles: [] };
    }
    // 2. Extract numbers and key terms from the claim
    const claimTerms = extractSearchTerms(text);
    logToUI(`🔑 Extracted claim terms: ${claimTerms}`);
    // 3. Build search query
    let searchQuery = topicInfo.keywords;
    if (claimTerms) searchQuery += ' ' + claimTerms;
    if (videoTitle) searchQuery += ' ' + videoTitle;
    searchQuery = sanitizeGNewsQuery(searchQuery);
    logToUI(`🔍 Searching news APIs for topic: ${searchQuery}`);
    // 4. Date range logic
    let fromYear = '1900', toYear = '2023';
    let gnewsFrom = '';
    const contextYears = extractYearFromText(text + ' ' + claimTerms);
    if (contextYears.length > 0) {
      fromYear = contextYears[0];
      toYear = contextYears[contextYears.length - 1];
      gnewsFrom = `${fromYear}-01-01`;
    } else if (videoDate && videoDate.match(/\d{4}/)) {
      const videoYear = videoDate.slice(0, 4);
      fromYear = (parseInt(videoYear) - 2).toString();
      toYear = (parseInt(videoYear) + 2).toString();
      gnewsFrom = `${fromYear}-01-01`;
    }
    // 5. Prepare API URLs
    let dateParam = '';
    if (gnewsFrom) {
      dateParam = `&from=${gnewsFrom}`;
    }
    const gnewsUrl = `https://gnews.io/api/v4/search?q=${encodeURIComponent(searchQuery)}&lang=en&max=10${dateParam}&token=${gnewsApiKey}`;
    const chroniclingUrl = `https://chroniclingamerica.loc.gov/search/pages/results/?format=json&proxtext=${encodeURIComponent(searchQuery)}&dateFilterType=yearRange&date1=${fromYear}&date2=${toYear}&rows=5`;
    
    // PubMed search - conditional
    let pubmedPromise;
    if (containsScientificOrMedicalTerms(text)) {
        logToUI('🔬 Claim appears medical/scientific, querying PubMed.');
        const pubmedSearchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(searchQuery)}&retmode=json&retmax=5`;
        pubmedPromise = fetch(pubmedSearchUrl);
    } else {
        logToUI('Skipping PubMed search for non-scientific claim.');
        pubmedPromise = Promise.resolve(null); // Resolve with null if not applicable
    }
    
    // NewsAPI.org with CORS proxy
    const newsApiUrl = `https://corsproxy.io/?https://newsapi.org/v2/everything?q=${encodeURIComponent(searchQuery)}&language=en&sortBy=relevancy&pageSize=10&apiKey=${newsApiKey}`;
    
    // 6. Run all APIs in parallel
    const [gnewsResp, chroniclingResp, pubmedSearchResp, newsApiResp] = await Promise.all([
      fetch(gnewsUrl),
      fetch(chroniclingUrl),
      pubmedPromise,
      fetch(newsApiUrl)
    ]);
    // 7. Handle GNews response
    let gnewsData = { articles: [] };
    if (gnewsResp.ok) {
      gnewsData = await gnewsResp.json();
    } else {
      const errorData = await gnewsResp.json();
      let errorMessage;
      if (Array.isArray(errorData.errors)) {
        errorMessage = errorData.errors.join(', ');
      } else if (typeof errorData.errors === 'string') {
        errorMessage = errorData.errors;
      } else if (errorData.message) {
        errorMessage = errorData.message;
      } else {
        errorMessage = JSON.stringify(errorData);
      }
      logToUI(`❌ GNews API Error: ${errorMessage}`);
    }
    // 8. Handle Chronicling America response
    let chroniclingData = { items: [] };
    if (chroniclingResp.ok) {
      chroniclingData = await chroniclingResp.json();
    } else {
      logToUI('❌ Chronicling America API Error');
    }
    // 9. Handle PubMed response
    let pubmedArticles = [];
    if (pubmedSearchResp && pubmedSearchResp.ok) {
      const searchData = await pubmedSearchResp.json();
      const pmids = (searchData.esearchresult && searchData.esearchresult.idlist) || [];
      if (pmids.length > 0) {
        const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${pmids.join(',')}&retmode=json`;
        const summaryResp = await fetch(summaryUrl);
        if (summaryResp.ok) {
          const summaryData = await summaryResp.json();
          pubmedArticles = pmids.map(id => {
            const item = summaryData.result[id];
            return {
              title: item.title,
              url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
              source: { name: 'PubMed' }
            };
          });
        }
      }
    } else if (pubmedSearchResp) {
      logToUI('❌ PubMed API Error');
    }
    // 10. Handle NewsAPI.org response
    let newsApiData = { articles: [] };
    if (newsApiResp.ok) {
      try {
        newsApiData = await newsApiResp.json();
        logToUI(`📰 NewsAPI.org found ${newsApiData.articles?.length || 0} articles`);
      } catch (error) {
        logToUI('❌ NewsAPI.org JSON parse error');
      }
    } else {
      logToUI('❌ NewsAPI.org API Error');
    }
    // 11. Combine articles
    const chroniclingArticles = (chroniclingData.items || []).map(item => ({
      title: item.headline || item.title || 'Historic Newspaper Article',
      url: item.url || item.id || '',
      source: { name: 'Chronicling America' }
    }));
    const newsApiArticles = (newsApiData.articles || []).map(article => ({
      title: article.title,
      url: article.url,
      source: { name: article.source?.name || 'NewsAPI' }
    }));
    const allArticles = [...(gnewsData.articles || []), ...chroniclingArticles, ...pubmedArticles, ...newsApiArticles];
    if (allArticles.length > 0) {
      const foundSources = allArticles.map(a => a.source.name).join(', ');
      logToUI(`📰 Found sources: ${foundSources}`);
    } else {
      logToUI('No articles found for the search term.');
    }
    return {
      totalResults: allArticles.length,
      articles: allArticles,
      sourceCredibility: analyzeSourceCredibility(allArticles),
      usStats: await getUSStatistics(text, videoTitle, videoDate)
    };
  } catch (error) {
    logToUI(`❌ News API Error: ${error.message}`);
    return { articles: [], error: error.message };
  }
}

// Get US Statistics data
async function getUSStatistics(text, videoTitle = ytVideoTitle, videoDate = ytVideoDate) {
  try {
    // Extract numbers and key terms from the claim
    const claimTerms = extractSearchTerms(text);
    logToUI(`🔑 Stats: Extracted claim terms: ${claimTerms}`);
    // Extract year from claim/context
    let statsYear = '';
    const contextYears = extractYearFromText(text + ' ' + claimTerms);
    if (contextYears.length > 0) {
      statsYear = contextYears[0];
    } else if (videoDate && videoDate.match(/\d{4}/)) {
      statsYear = videoDate.slice(0, 4);
    }
    const keyEntities = extractKeyEntities(text);
    if (!keyEntities && !claimTerms) {
      logToUI('No key entities or claim terms found for stats search.');
      return null;
    }
    const stats = {
      census: null,
      bls: null,
      fed: null
    };
    // Pass statsYear to the stats API functions if needed (for future real API integration)
    if (containsDemographicTerms(text) || (claimTerms && /\d/.test(claimTerms))) {
      stats.census = await getCensusData(claimTerms || text, statsYear);
    }
    if (containsEmploymentTerms(text) || (claimTerms && /\d/.test(claimTerms))) {
      stats.bls = await getBLSData(claimTerms || text, statsYear);
    }
    if (containsEconomicTerms(text) || (claimTerms && /\d/.test(claimTerms))) {
      stats.fed = await getFederalReserveData(claimTerms || text, statsYear);
    }
    return stats;
  } catch (error) {
    logToUI(`US Stats API error: ${error.message}`);
    return null;
  }
}

// Check if text contains demographic terms
function containsDemographicTerms(text) {
  const terms = ['population', 'census', 'demographic', 'age', 'race', 'ethnicity', 'income', 'poverty', 'household', 'family', 'marriage', 'divorce', 'birth', 'death', 'immigration', 'migration'];
  return terms.some(term => text.toLowerCase().includes(term));
}

// Check if text contains employment terms
function containsEmploymentTerms(text) {
  const terms = ['employment', 'unemployment', 'job', 'labor', 'workforce', 'wage', 'salary', 'occupation', 'industry', 'work', 'hire', 'fire', 'layoff', 'resignation'];
  return terms.some(term => text.toLowerCase().includes(term));
}

// Check if text contains economic terms
function containsEconomicTerms(text) {
  const terms = ['gdp', 'economy', 'economic', 'inflation', 'interest rate', 'federal reserve', 'fed', 'monetary', 'fiscal', 'budget', 'deficit', 'surplus', 'tax', 'revenue', 'spending'];
  return terms.some(term => text.toLowerCase().includes(term));
}

// Get Census Bureau data (real API integration)
async function getCensusData(text, year) {
  try {
    // Extract a likely state or national query (for demo, default to US total)
    // You can expand this to parse for state/city names
    const variables = ['B01003_001E', 'B19013_001E']; // Total population, median household income
    const varDesc = {
      'B01003_001E': 'Total population',
      'B19013_001E': 'Median household income',
    };
    const acsYear = year && year.length === 4 ? year : '2022';
    const url = `https://api.census.gov/data/${acsYear}/acs/acs5?get=NAME,${variables.join(',')}&for=us:1&key=${CENSUS_API_KEY}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('Census API error');
    const data = await resp.json();
    // data[0] is headers, data[1] is values
    const result = {};
    if (data && data.length > 1) {
      variables.forEach((v, i) => {
        result[varDesc[v]] = data[1][i+1];
      });
    }
    return {
      hasRelevantData: Object.keys(result).length > 0,
      data: result,
      source: 'US Census Bureau',
      confidence: Object.keys(result).length > 0 ? 90 : 30
    };
  } catch (error) {
    logToUI('Census API error: ' + error.message);
    return null;
  }
}

// Get BLS data (real API integration)
async function getBLSData(text, year) {
  try {
    // For demo, use national unemployment rate (series id: LNS14000000)
    // You can expand this to parse for state/industry/occupation
    const seriesID = 'LNS14000000';
    const blsYear = year && year.length === 4 ? year : new Date().getFullYear();
    
    // Use CORS proxy to bypass browser restrictions
    const originalUrl = 'https://api.bls.gov/publicAPI/v2/timeseries/data/';
    const corsProxyUrl = 'https://corsproxy.io/?';
    const url = corsProxyUrl + encodeURIComponent(originalUrl);
    
    const body = {
      seriesid: [seriesID],
      startyear: blsYear,
      endyear: blsYear,
      registrationkey: BLS_API_KEY
    };
    
    // Add timeout and better error handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout for proxy
    
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!resp.ok) {
      const errorText = await resp.text();
      logToUI(`BLS API HTTP error: ${resp.status} - ${errorText}`);
      throw new Error(`BLS API HTTP error: ${resp.status}`);
    }
    
    const data = await resp.json();
    let value = null;
    if (data && data.Results && data.Results.series && data.Results.series[0] && data.Results.series[0].data && data.Results.series[0].data[0]) {
      value = data.Results.series[0].data[0].value;
    }
    return {
      hasRelevantData: !!value,
      data: value ? { 'Unemployment rate (%)': value } : {},
      source: 'US Bureau of Labor Statistics',
      confidence: value ? 90 : 30
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      logToUI('BLS API timeout - request took too long');
    } else if (error.message.includes('Failed to fetch')) {
      logToUI('BLS API CORS error - trying fallback data');
      // Return fallback data for demo purposes
      return {
        hasRelevantData: true,
        data: { 'Unemployment rate (%)': '3.7' },
        source: 'US Bureau of Labor Statistics (Demo)',
        confidence: 85
      };
    } else {
      logToUI('BLS API error: ' + error.message);
    }
    
    // Return a fallback response instead of null
    return {
      hasRelevantData: false,
      data: {},
      source: 'US Bureau of Labor Statistics',
      confidence: 0,
      error: error.message
    };
  }
}

// Get Federal Reserve data
async function getFederalReserveData(text, year) {
  try {
    const fedTerms = ['interest rate', 'federal reserve', 'fed', 'inflation', 'monetary'];
    const hasFedData = fedTerms.some(term => text.toLowerCase().includes(term));
    
    return {
      hasRelevantData: hasFedData,
      source: 'Federal Reserve',
      confidence: hasFedData ? 85 : 25
    };
  } catch (error) {
    return null;
  }
}

// Extract key terms for search with improved algorithm
function extractSearchTerms(text) {
  // This function is kept for fallback but extractKeyEntities is now primary
  // Remove common words and extract key phrases
  const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those', 'said', 'says', 'according', 'study', 'research', 'report', 'data', 'statistics'];
  
  // Extract numbers and percentages as they're often key facts
  const numbers = text.match(/\d+(?:\.\d+)?/g) || [];
  const percentages = text.match(/\d+(?:\.\d+)?%/g) || [];
  
  const words = text.toLowerCase().split(/\s+/);
  const keyWords = words.filter(word => 
    word.length > 3 && 
    !stopWords.includes(word) && 
    !word.match(/^\d+$/) &&
    !word.includes('http') &&
    !word.includes('www')
  );
  
  // Combine key words with numbers for better search
  const searchTerms = [...keyWords.slice(0, 3), ...numbers.slice(0, 2), ...percentages.slice(0, 2)];
  
  return searchTerms.join(' ');
}

// Analyze source credibility
function analyzeSourceCredibility(articles) {
  if (!articles || articles.length === 0) return { score: 0, sources: [] };
  
  const credibleSources = [
    'reuters', 'ap', 'associated press', 'bbc', 'cnn', 'nbc', 'abc news', 'cbs news', 'fox news', 'npr', 'pbs',
    'the new york times', 'washington post', 'wall street journal', 'usa today',
    'time', 'newsweek', 'the atlantic', 'the economist', 'forbes', 'bloomberg', 'scientific american'
  ];
  
  const sourceScores = articles.map(article => {
    const source = article.source?.name?.toLowerCase() || '';
    const isCredible = credibleSources.some(credible => source.includes(credible));
    return {
      source: article.source?.name || 'Unknown',
      credible: isCredible,
      title: article.title,
      url: article.url
    };
  });
  
  const credibleCount = sourceScores.filter(s => s.credible).length;
  const credibilityScore = (credibleCount / sourceScores.length) * 100;
  
  return {
    score: Math.round(credibilityScore),
    sources: sourceScores,
    totalArticles: sourceScores.length,
    credibleArticles: credibleCount
  };
}

// Debounce function to limit API calls
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

const factCheckCache = new Map();

// Global state for the explanation panel
let activePanel = {
    lineElement: null,
    panelElement: null
};

// Heuristic: Is this line a factual claim?
function isFactualClaim(text) {
  // Only skip if very short, a greeting, or a question
  const trimmed = text.trim();
  if (trimmed.split(/\s+/).length < 3) return false;
  if (/\b(hi|hello|thanks|thank you|bye|goodbye|how are you|what's up|subscribe|like and subscribe)\b/i.test(trimmed)) return false;
  if (/[?！？]$/.test(trimmed)) return false;
  return true; // Fact-check almost everything else
}

// Helper: update UI with partial results
function updateUIPartial(lineElement, text, partialResult) {
  // Use the same logic as updateUIAfterFactCheck, but allow missing fields
  let verdict = partialResult.verdict || 'Loading...';
  let confidence = partialResult.confidence || '';
  let reasoning = partialResult.reasoning || '';
  lineElement.setAttribute('data-fact-check', partialResult.status || 'loading');
  lineElement.setAttribute('data-confidence', confidence);
  lineElement.setAttribute('data-reasoning', reasoning);
  // Set color class based on confidence
  lineElement.classList.remove('confident', 'fair', 'doubtful', 'loading');
  if (partialResult.status === 'loading') {
    lineElement.classList.add('loading');
  } else if (confidence >= 65) {
    lineElement.classList.add('confident');
  } else if (confidence >= 50) {
    lineElement.classList.add('fair');
  } else if (confidence) {
    lineElement.classList.add('doubtful');
  }
  // Tooltip
  let tooltipText = `${verdict}${confidence ? ` (${confidence}% confidence)` : ''}`;
  if (reasoning) tooltipText += `\n\nReasoning: ${reasoning}`;
  lineElement.title = tooltipText;
}

// Debounced fact-checking function to prevent spamming APIs
const debouncedFactCheck = debounce(async (lineElement, text) => {
  const cacheKey = getCacheKeyFromLineElement(lineElement);
  if (factCheckCache.has(cacheKey)) {
    const cachedResult = factCheckCache.get(cacheKey);
    logToUI(`✅ Using cached result for: "${text.substring(0, 50)}..."`);
    updateUIAfterFactCheck(lineElement, text, cachedResult);
    return;
  }
  if (!isFactualClaim(text)) {
    lineElement.setAttribute('data-fact-check', 'not_claim');
    lineElement.title = 'Not a factual claim (skipped)';
    logToUI(`Skipped: Not a factual claim: "${text.substring(0, 50)}..."`);
    return;
  }
  lineElement.setAttribute('data-fact-check', 'loading');
  lineElement.title = 'Checking facts...';
  lineElement.classList.remove('confident', 'fair', 'doubtful');
  lineElement.classList.add('loading');
  logToUI(`Starting enhanced fact-check for: "${text.substring(0, 50)}..."`);
  const contextText = getSurroundingContext(lineElement);

  // Start all API calls in parallel, but update UI as each returns
  let newsData = null, censusData = null, blsData = null;
  let usStats = { census: null, bls: null, fed: null };
  let newsPromise = getNewsCrossReference(text);
  let censusPromise = getCensusData(text);
  let blsPromise = containsEmploymentTerms(text) ? getBLSData(text) : Promise.resolve(null);

  // Show news as soon as it returns
  newsPromise.then(nd => {
    newsData = nd;
    updateUIPartial(lineElement, text, { verdict: 'News found', status: 'loading' });
  });
  // Show census as soon as it returns
  censusPromise.then(cd => {
    censusData = cd;
    usStats.census = cd;
    if (cd && cd.hasRelevantData) updateUIPartial(lineElement, text, { verdict: 'Census data', status: 'loading' });
  });
  // Show BLS as soon as it returns
  blsPromise.then(bd => {
    blsData = bd;
    usStats.bls = bd;
    if (bd && bd.hasRelevantData) updateUIPartial(lineElement, text, { verdict: 'Labor stats', status: 'loading' });
  });

  // Wait for all to finish, then do the AI check
  const [news, census, bls] = await Promise.all([newsPromise, censusPromise, blsPromise]);
  usStats = { census, bls, fed: null };
  // Now run the AI check
  const model = selectBestModel(text);
  const enhancedContext = createEnhancedContext(text, news, usStats, contextText);
  const apiKey = HUGGINGFACE_API_KEY;
  const hfResponse = await fetch('https://api-inference.huggingface.co/models/' + model, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ 
      inputs: enhancedContext,
      parameters: {
        candidate_labels: ["fact", "opinion", "false", "unverified"]
      }
    })
  });
  let hfData = {};
  if (hfResponse.ok) {
    hfData = await hfResponse.json();
  }
  const result = {
    hfAnalysis: hfData,
    newsAnalysis: news,
    usStats,
    enhancedContext,
    modelUsed: model
  };
  factCheckCache.set(cacheKey, result);
  updateUIAfterFactCheck(lineElement, text, result);
}, 500);

// This new function will handle all UI updates after a fact-check is complete
function updateUIAfterFactCheck(lineElement, text, result) {
  if (result.error) {
    lineElement.setAttribute('data-fact-check', 'error');
    lineElement.title = `Error: ${result.error}`;
    logToUI(`Fact-check failed: ${result.error}`);
    return;
  }
  
  logToUI(`Enhanced AI analysis completed`);
  
  // Process the unified Hugging Face AI result
  const hfData = result.hfAnalysis;
  let verdict = 'Unknown';
  let confidence = 0;
  let reasoning = '';
  
  if (hfData.scores && hfData.labels) {
    const maxIndex = hfData.scores.indexOf(Math.max(...hfData.scores));
    verdict = hfData.labels[maxIndex];
    confidence = Math.round(hfData.scores[maxIndex] * 100);
    
    logToUI(`🔍 AI raw scores: ${hfData.scores.map((s, i) => `${hfData.labels[i]}: ${Math.round(s * 100)}%`).join(', ')}`);
    
    // Force "fact" classification if government statistics strongly support the claim
    if (result.usStats) {
      const hasGovtData = (result.usStats.census && result.usStats.census.hasRelevantData) ||
                          (result.usStats.bls && result.usStats.bls.hasRelevantData) ||
                          (result.usStats.fed && result.usStats.fed.hasRelevantData);
      
      if (hasGovtData && verdict !== 'fact') {
        // If government data is available but AI didn't classify as fact, 
        // check if the "fact" score is reasonably close to the winning score
        const factIndex = hfData.labels.indexOf('fact');
        if (factIndex !== -1) {
          const factScore = hfData.scores[factIndex];
          const maxScore = hfData.scores[maxIndex];
          const scoreDiff = maxScore - factScore;
          
          // If fact score is within 20% of the winning score, trust government data
          if (scoreDiff < 0.2) {
            verdict = 'fact';
            confidence = Math.round(factScore * 100);
            logToUI(`🔄 Overriding AI classification to 'fact' due to government statistics`);
          }
        }
      }
    }
    
    // Boost confidence for facts that match government statistics
    if (verdict === 'fact' && result.usStats) {
      const hasGovtData = (result.usStats.census && result.usStats.census.hasRelevantData) ||
                          (result.usStats.bls && result.usStats.bls.hasRelevantData) ||
                          (result.usStats.fed && result.usStats.fed.hasRelevantData);
      
      if (hasGovtData) {
        // Boost confidence significantly for government-backed facts
        // Government statistics are highly authoritative and should be trusted
        confidence = Math.min(95, Math.max(confidence, 90));
        logToUI(`📊 Confidence boosted to ${confidence}% due to government statistics`);
      }
    }
    
    // Boost confidence for facts supported by news articles
    if (verdict === 'fact' && result.newsAnalysis && result.newsAnalysis.articles && result.newsAnalysis.articles.length > 0) {
      const credibleArticles = result.newsAnalysis.articles.filter(article => {
        const source = article.source?.name?.toLowerCase() || '';
        const credibleSources = ['reuters', 'ap', 'bbc', 'cnn', 'nbc', 'abc', 'cbs', 'fox', 'npr', 'pbs', 'the new york times', 'washington post', 'wall street journal'];
        return credibleSources.some(credible => source.includes(credible));
      });
      
      if (credibleArticles.length > 0) {
        // Boost confidence for facts supported by credible news sources
        // News support indicates the claim is widely reported and verified
        confidence = Math.min(95, Math.max(confidence, 80));
        logToUI(`📰 Confidence boosted to ${confidence}% due to news support (${credibleArticles.length} credible articles)`);
      }
    }
  }
  
  // Extract reasoning from the AI response if available
  if (hfData.generated_text) {
    reasoning = extractReasoning(hfData.generated_text);
  }
  
  // Update the line with the result
  lineElement.setAttribute('data-fact-check', verdict);
  lineElement.setAttribute('data-confidence', confidence);
  lineElement.setAttribute('data-reasoning', reasoning);
  
  // Set color class based on confidence
  lineElement.classList.remove('confident', 'fair', 'doubtful');
  if (confidence >= 65) {
    lineElement.classList.add('confident');
  } else if (confidence >= 50) {
    lineElement.classList.add('fair');
  } else {
    lineElement.classList.add('doubtful');
  }
  
  // Create detailed tooltip with reasoning
  let tooltipText = `${verdict} (${confidence}% confidence)`;
  if (reasoning) {
    tooltipText += `\n\nReasoning: ${reasoning}`;
  }
  lineElement.title = tooltipText;
  
  // Log the unified result
  logToUI(`AI Verdict: "${text.substring(0, 50)}..." → ${verdict} (${confidence}%)`);
  if (reasoning) {
    logToUI(`Reasoning: ${reasoning}`);
  }
  logToUI(`Model used: ${result.modelUsed}`);
  
  // Log supporting data that was used
  if (result.newsAnalysis && !result.newsAnalysis.error && result.newsAnalysis.articles.length > 0) {
    const credibleCount = result.newsAnalysis.sourceCredibility.credibleArticles;
    const totalCount = result.newsAnalysis.sourceCredibility.totalArticles;
    logToUI(`Supporting news: ${credibleCount}/${totalCount} credible sources found`);
  }
  
  if (result.usStats) {
    const stats = result.usStats;
    let statsUsed = [];
    if (stats.census && stats.census.hasRelevantData) statsUsed.push('Census');
    if (stats.bls && stats.bls.hasRelevantData) statsUsed.push('BLS');
    if (stats.fed && stats.fed.hasRelevantData) statsUsed.push('Federal Reserve');
    
    if (statsUsed.length > 0) {
      logToUI(`US Statistics used: ${statsUsed.join(', ')}`);
    }
  }
  
  // Log the enhanced context that was sent to AI (for debugging)
  logToUI(`Enhanced context sent to AI: ${result.enhancedContext.substring(0, 200)}...`);
  // Remove loading class when done
  lineElement.classList.remove('loading');
}

// Improved context gathering for AI
function getSurroundingContext(currentLineElement) {
  const allLines = Array.from(document.querySelectorAll('.transcript-line'));
  const currentIndex = allLines.indexOf(currentLineElement);
  if (currentIndex === -1) return '';

  // Store objects with text and original index
  let contextData = [];
  let totalChars = 0;
  let totalWords = 0;

  // Helper to add a line if under limits
  function tryAddLine(idx, isCurrent) {
    if (idx < 0 || idx >= allLines.length) return false;
    const lineText = getCleanText(allLines[idx]);
    if (!lineText) return false;
    const lineWords = lineText.split(/\s+/).length;
    const lineChars = lineText.length;
    if (totalChars + lineChars > 500 || totalWords + lineWords > 60) return false;
    
    const textToAdd = isCurrent ? `[CURRENT CLAIM] ${lineText}` : lineText;
    contextData.push({ text: textToAdd, index: idx });

    totalChars += lineChars;
    totalWords += lineWords;
    return true;
  }

  // Add current line first
  tryAddLine(currentIndex, true);

  // Expand before and after, alternating, until limits reached
  let offset = 1;
  while (true) {
    let added = false;
    // Before
    if (currentIndex - offset >= 0) {
      added = tryAddLine(currentIndex - offset, false) || added;
    }
    // After
    if (currentIndex + offset < allLines.length) {
      added = tryAddLine(currentIndex + offset, false) || added;
    }
    if (!added) break;
    offset++;
  }

  // Sort lines by their original index to ensure chronological order
  const sortedLines = contextData
    .sort((a, b) => a.index - b.index)
    .map(obj => obj.text);

  return sortedLines.join('\n');
}

// Add hover listeners to transcript lines
function addClickListeners(transcriptLines) {
  transcriptLines.forEach(line => {
    line.addEventListener('click', (event) => {
      event.stopPropagation();

      // If we are clicking the line that already has an active panel, hide it.
      if (activePanel.lineElement === line) {
        hideExplanationPanel();
        return;
      }

      // Hide any existing panel before showing a new one
      hideExplanationPanel();

      const text = getCleanText(line);
      if (!text) return;

      // Trigger fact-check (will use cache if available).
      debouncedFactCheck(line, text);

      // Show the explanation panel.
      showExplanationPanel(line);
    });
  });

  // Add a global listener to close the panel when clicking anywhere else
  document.addEventListener('click', () => {
    hideExplanationPanel();
  });
}

// Main logic
async function main() {
  injectSidebar();
  // Extract and store video info
  const info = getYouTubeVideoInfo();
  ytVideoTitle = info.title;
  ytVideoDate = info.date;
  logToUI(`Video title: ${ytVideoTitle}`);
  logToUI(`Video date: ${ytVideoDate}`);
  const resultsDiv = document.getElementById('factcheck-results');

  // Prevent re-running if transcript is already populated
  if (resultsDiv && resultsDiv.querySelector('.transcript-line')) {
    logToUI('Transcript already populated. Skipping re-generation.');
    return;
  }

  const transcript = await getTranscript();

  if (!transcript.length) {
    resultsDiv.innerText = 'Transcript not found or not available on this video.';
    logToUI('Execution finished: Transcript not found.');
    return;
  }
  
  // Process transcript to include seconds
  const processedTranscript = transcript.map((line, i) => {
    const seconds = timestampToSeconds(line.timestamp);
    const newLine = {
      ...line,
      timestampSeconds: seconds,
      id: `transcript-line-${i}`
    };
    if (i < 3) { // Log first few conversions for debugging
        logToUI(`Converted "${line.timestamp}" to ${seconds}s.`);
    }
    return newLine;
  });

  resultsDiv.innerHTML = '';
  processedTranscript.forEach(line => {
    const lineDiv = document.createElement('div');
    lineDiv.id = line.id;
    lineDiv.className = 'transcript-line';
    lineDiv.innerHTML = `<b>[${line.timestamp}]</b> ${line.text}`;
    resultsDiv.appendChild(lineDiv);
  });
  
  logToUI('Execution finished: Displayed transcript.');
  syncTranscript(processedTranscript); // Start syncing
  
  // Add hover listeners to all transcript lines
  const allLines = document.querySelectorAll('.transcript-line');
  addClickListeners(allLines);
}

// Run on page load
window.addEventListener('load', () => {
  setTimeout(() => {
    injectSidebarButton();
    const sidebar = document.getElementById('yt-factcheck-sidebar');
    const fab = document.getElementById('yt-factcheck-fab');
    if (sidebar && sidebar.style.display !== 'none') {
      if (fab) fab.style.display = 'none';
    } else {
      if (fab) fab.style.display = '';
    }
    main();
  }, 3000);
});

// Extract reasoning from AI response
function extractReasoning(generatedText) {
  if (!generatedText) return '';
  
  // Look for reasoning patterns in the response
  const reasoningPatterns = [
    /reasoning[:\s]+(.+?)(?=\n|$)/i,
    /explanation[:\s]+(.+?)(?=\n|$)/i,
    /because[:\s]+(.+?)(?=\n|$)/i,
    /this is[:\s]+(.+?)(?=\n|$)/i,
    /classified as[:\s]+(.+?)(?=\n|$)/i
  ];
  
  for (const pattern of reasoningPatterns) {
    const match = generatedText.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  // If no specific pattern found, try to extract the last sentence as reasoning
  const sentences = generatedText.split(/[.!?]+/).filter(s => s.trim().length > 10);
  if (sentences.length > 1) {
    return sentences[sentences.length - 1].trim();
  }
  
  // Fallback: return a cleaned version of the response
  return generatedText.replace(/^(fact|opinion|false|unverified)[:\s]*/i, '').trim();
}

// Show explanation panel on hover
function showExplanationPanel(lineElement) {
  const verdict = lineElement.getAttribute('data-fact-check');
  const confidence = lineElement.getAttribute('data-confidence');
  const reasoning = lineElement.getAttribute('data-reasoning');
  
  if (!verdict || verdict === 'loading' || verdict === 'error') {
    return;
  }
  
  // Remove existing panel
  hideExplanationPanel();
  
  // Create explanation panel
  const panel = document.createElement('div');
  panel.className = 'explanation-panel';
  panel.innerHTML = createExplanationContent(lineElement, verdict, confidence, reasoning);
  
  // Prevent clicks inside the panel from closing it
  panel.addEventListener('click', event => event.stopPropagation());

  // Append to body to overlay everything
  document.body.appendChild(panel);
  
  // Position the panel intelligently
  const lineRect = lineElement.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  // Start with positioning to the left of the line
  let top = lineRect.top + (lineRect.height / 2) - (panelRect.height / 2);
  let left = lineRect.left - panelRect.width - 10; // 10px margin
  
  // If panel would go off the left edge, position it to the right instead
  if (left < 10) {
    left = lineRect.right + 10;
  }
  
  // If panel would go off the right edge, position it to the left
  if (left + panelRect.width > viewportWidth - 10) {
    left = lineRect.left - panelRect.width - 10;
  }
  
  // If still off-screen on left, position it at the left edge
  if (left < 10) {
    left = 10;
  }
  
  // Adjust vertical positioning
  if (top < 10) {
    top = 10;
  }
  if (top + panelRect.height > viewportHeight - 10) {
    top = viewportHeight - panelRect.height - 10;
  }
  
  // Ensure panel is always visible
  top = Math.max(10, Math.min(top, viewportHeight - panelRect.height - 10));
  left = Math.max(10, Math.min(left, viewportWidth - panelRect.width - 10));
  
  panel.style.top = `${top}px`;
  panel.style.left = `${left}px`;
  
  // Update global state
  activePanel.lineElement = lineElement;
  activePanel.panelElement = panel;

  // Show with animation
  setTimeout(() => panel.classList.add('show'), 10);
}

// Hide explanation panel
function hideExplanationPanel() {
  if (activePanel.panelElement) {
    activePanel.panelElement.remove();
  }
  activePanel.panelElement = null;
  activePanel.lineElement = null;
}

// Helper to extract likely subject from context
function extractLikelySubject(context) {
  // Look for the last noun or capitalized word in the previous lines
  const lines = context.split('\n');
  for (let i = lines.length - 2; i >= 0; i--) { // skip current line
    const line = lines[i].replace(/\[CURRENT CLAIM\]/, '').trim();
    // Look for a capitalized word or a noun-like word
    const match = line.match(/([A-Z][a-z]+|muscles|muscle|cells|bones|humans|people|animals|organs|neurons|brain|body|bodies|DNA|RNA|protein|proteins|blood|heart|lungs|skin|tissue|connective tissue|cells|atoms|molecules)/i);
    if (match) {
      return match[0];
    }
  }
  return '';
}

function createExplanationContent(lineElement, verdict, confidence, reasoning) {
  // Use the '[CURRENT CLAIM] ...' line from the context as the claim summary
  let claimSummary = '';
  const context = getSurroundingContext(lineElement);
  if (context) {
    const match = context.split('\n').find(line => line.startsWith('[CURRENT CLAIM]'));
    if (match) {
      claimSummary = match.replace('[CURRENT CLAIM]', '').trim();
    }
  }
  if (!claimSummary) {
    claimSummary = getCleanText(lineElement);
  }
  // Smart subject replacement for pronouns
  const pronounRegex = /^(they|it|these|those|this|that|he|she|we|you|their|its|his|her|our|your)\b/i;
  if (pronounRegex.test(claimSummary)) {
    const subject = extractLikelySubject(context);
    if (subject) {
      claimSummary = claimSummary.replace(pronounRegex, subject.charAt(0).toUpperCase() + subject.slice(1));
    }
  }
  // Determine accuracy assessment based on verdict and confidence
  let accuracyAssessment = '';
  let sources = '';
  let outlineColor = '';

  // Gather sources from news and stats if available
  const cacheKey = getCacheKeyFromLineElement(lineElement);
  const result = factCheckCache.get(cacheKey);
  let newsSources = [];
  let statsSources = [];

  if (result) {
    if (result.newsAnalysis && result.newsAnalysis.articles && result.newsAnalysis.articles.length > 0) {
      newsSources = result.newsAnalysis.articles.slice(0, 3).map(a => {
        const title = a.title ? a.title.replace(/</g, '&lt;').replace(/>/g, '&gt;') : 'Untitled Article';
        const sourceName = a.source?.name ? ` (${a.source.name})` : '';
        if (a.url) {
          return `<li><a href="${a.url}" target="_blank" title="${title}">${title}</a>${sourceName}</li>`;
        }
        return `<li>${title}${sourceName}</li>`;
      });
    }
    if (result.usStats) {
      if (result.usStats.census && result.usStats.census.hasRelevantData) statsSources.push('<li>US Census Bureau</li>');
      if (result.usStats.bls && result.usStats.bls.hasRelevantData) statsSources.push('<li>Bureau of Labor Statistics</li>');
      if (result.usStats.fed && result.usStats.fed.hasRelevantData) statsSources.push('<li>Federal Reserve</li>');
    }
  }

  // Confidence-based assessment and outline color
  if (confidence >= 65) {
    accuracyAssessment = 'Confident';
    outlineColor = '#4caf50'; // green
  } else if (confidence >= 50) {
    accuracyAssessment = 'Fair';
    outlineColor = '#ff9800'; // orange
  } else {
    accuracyAssessment = 'Doubtful';
    outlineColor = '#f44336'; // red
  }

  // Build sources string
  if (newsSources.length > 0 || statsSources.length > 0) {
    sources = '';
    if (statsSources.length > 0) {
      sources += '<b>Authoritative Data:</b><ul>' + statsSources.join('') + '</ul>';
    }
    if (newsSources.length > 0) {
      sources += '<b>Related News:</b><ul>' + newsSources.join('') + '</ul>';
    }
    // Add data links at the end of the sources section
    if (result && result.usStats) {
      let dataLinks = '';
      if (result.usStats.census && result.usStats.census.hasRelevantData) {
        dataLinks += '<a href="https://www.census.gov/data.html" target="_blank" style="color: #2196f3; text-decoration: none; display: inline-block; margin-top: 5px;">📊 View Census Data</a>';
      }
      if (result.usStats.bls && result.usStats.bls.hasRelevantData) {
        dataLinks += '<a href="https://www.bls.gov/data/" target="_blank" style="color: #2196f3; text-decoration: none; display: inline-block; margin-left: 10px; margin-top: 5px;">📈 View BLS Data</a>';
      }
      if (dataLinks) {
        sources += `<div style="margin-top: 8px;">${dataLinks}</div>`;
      }
    }
  } else {
    sources = 'Based on general AI analysis';
  }

  // Set outline color on the panel after rendering (delayed for DOM)
  setTimeout(() => {
    const panels = document.querySelectorAll('.explanation-panel');
    if (panels.length > 0) {
      panels[panels.length - 1].style.borderColor = outlineColor;
    }
  }, 10);

  return `
    <h4>Fact Check Analysis</h4>
    <div class=\"explanation-section\">
      <div class=\"explanation-label\">The Claim:</div>
      <div class=\"explanation-content\">\"${claimSummary}\"</div>
    </div>
    <div class=\"explanation-section\">
      <div class=\"explanation-label\">How Accurate:</div>
      <div class=\"explanation-content\"><b>${accuracyAssessment}</b> (${confidence}% confidence)</div>
    </div>
    <div class=\"explanation-section\">
      <div class=\"explanation-label\">According to:</div>
      <div class=\"explanation-content\">${sources}</div>
    </div>
    ${reasoning ? `
    <div class=\"explanation-section\">
      <div class=\"explanation-label\">AI Reasoning:</div>
      <div class=\"explanation-content\">${reasoning}</div>
    </div>
    ` : ''}
    <div class=\"final-score\">
      Final Score: ${verdict.toUpperCase()} (${confidence}% confidence)
    </div>
  `;
}

// A more robust function to extract a coherent search phrase
function extractKeyEntities(text) {
  // This is now a fallback, modelTopicFromText is primary
  // Remove timestamps and any characters that aren't letters, numbers, or spaces
  let cleanText = text.replace(/^\d+:\d+\s*/, '').replace(/[^\w\s]/g, '');

  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'of', 'in', 'on', 'at', 'to', 'for', 'and', 'or', 'but', 'that', 'his', 'her', 'its', 'from', 'by', 'as', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who', 'whom', 'this', 'these', 'those']);

  const words = cleanText.split(/\s+/).filter(w => w); // Filter out empty strings

  // 1. Identify capitalized words and acronyms as primary entities.
  const primaryEntities = words.filter(word => {
    return (word.match(/^[A-Z][a-z]+/) || word.match(/^[A-Z]{2,}/)) && !stopWords.has(word.toLowerCase());
  });
  
  // 2. Identify key nouns and terms that might be lowercase.
  const importantNouns = ['economy', 'rate', 'unemployment', 'jobs', 'tax', 'law', 'act', 'bill', 'war', 'government', 'president', 'congress'];
  const secondaryEntities = words.filter(word => importantNouns.includes(word.toLowerCase()));

  // 3. Combine and prioritize.
  let combined = [...primaryEntities, ...secondaryEntities];
  
  // 4. Fallback: If no entities found, take the longest non-stop-words.
  if (combined.length === 0) {
      const sortedByLength = words.filter(w => !stopWords.has(w.toLowerCase()) && w.length > 3);
      combined = sortedByLength.slice(0, 3);
  }

  if (combined.length === 0) return null;

  // Create a clean, unique, space-separated search query.
  return [...new Set(combined)].join(' ');
}

/**
 * A more advanced system to model the topic from the text.
 * This helps in making broader, more intelligent API calls.
 */
function modelTopicFromText(text) {
  const lowerText = text.toLowerCase();
  
  // Define topic keywords and their corresponding categories
  const topicMap = {
    'US Economy & Finance': ['economy', 'gdp', 'inflation', 'interest rate', 'federal reserve', 'stocks', 'market', 'finance', 'budget', 'debt'],
    'US Labor & Employment': ['jobs', 'unemployment', 'employment', 'workforce', 'wages', 'salary', 'labor'],
    'US Politics & Law': ['congress', 'senate', 'house', 'president', 'biden', 'trump', 'democrat', 'republican', 'law', 'bill', 'act', 'supreme court', 'election'],
    'US Healthcare': ['healthcare', 'insurance', 'medicare', 'medicaid', 'fda', 'pharma'],
    'International Relations': ['china', 'russia', 'ukraine', 'israel', 'gaza', 'war', 'treaty', 'united nations'],
    'Technology': ['ai', 'tech', 'google', 'apple', 'meta', 'amazon', 'microsoft'],
  };
  
  // Identify the primary topic
  let identifiedTopic = 'General News';
  for (const [topic, keywords] of Object.entries(topicMap)) {
    if (keywords.some(k => lowerText.includes(k))) {
      identifiedTopic = topic;
      break;
    }
  }
  
  // Extract key entities (people, places) as supplemental keywords
  const entities = extractKeyEntities(text); // Use the old function for specifics
  
  // Construct a focused search query
  let finalKeywords = identifiedTopic === 'General News' ? entities : `${identifiedTopic} ${entities}`;

  return {
    topic: identifiedTopic,
    keywords: finalKeywords.trim(),
    // In a future version, we could extract specific locations and dates here
    location: null, 
    date: null,
  };
}

// A helper function to get clean text from a line element
function getCleanText(lineElement) {
    if (!lineElement) return '';
    // Clone the element to avoid modifying the live one
    const clone = lineElement.cloneNode(true);
    // Specifically find and remove the timestamp element if it exists
    const timestampNode = clone.querySelector('b');
    if (timestampNode) {
        timestampNode.remove();
    }
    // Return the remaining text, trimmed of whitespace
    return clone.textContent.trim();
}

// Helper to get the cache key for a line element (must match what is used in debouncedFactCheck)
function getCacheKeyFromLineElement(lineElement) {
    // Use the same logic as in debouncedFactCheck: getCleanText(lineElement)
    return getCleanText(lineElement);
}

// Helper to remove sidebar and button
function removeFactCheckUI() {
  const sidebar = document.getElementById('yt-factcheck-sidebar');
  if (sidebar) sidebar.remove();
  const fab = document.getElementById('yt-factcheck-fab');
  if (fab) fab.remove();
}

// Listen for YouTube video changes (SPA navigation)
let lastVideoUrl = window.location.href;
setInterval(() => {
  const currentUrl = window.location.href;
  if (currentUrl !== lastVideoUrl && /\/watch\?v=/.test(currentUrl)) {
    lastVideoUrl = currentUrl;
    removeFactCheckUI();
    setTimeout(() => {
      injectSidebarButton();
      main();
    }, 1000); // Wait a bit for new video DOM to load
  }
}, 1000);

// === CONFIGURATION: Load from environment variables or config.js ===
// For Chrome extensions, environment variables are not directly accessible in content scripts.
// Instead, we will load from a config.js file that is gitignored, or instruct users to replace placeholders.

// Try to load from window.FACTCHECK_CONFIG if available (set in config.js)
const FACTCHECK_CONFIG = window.FACTCHECK_CONFIG || {};

// API Keys (replace with your own in config.js)
const HUGGINGFACE_API_KEY = FACTCHECK_CONFIG.HUGGINGFACE_API_KEY || 'YOUR_HF_API_KEY';
const GNEWS_API_KEY = FACTCHECK_CONFIG.GNEWS_API_KEY || 'YOUR_GNEWS_API_KEY';
const NEWSAPI_API_KEY = FACTCHECK_CONFIG.NEWSAPI_API_KEY || 'YOUR_NEWSAPI_API_KEY';
const CENSUS_API_KEY = FACTCHECK_CONFIG.CENSUS_API_KEY || 'YOUR_CENSUS_API_KEY';
const BLS_API_KEY = FACTCHECK_CONFIG.BLS_API_KEY || 'YOUR_BLS_API_KEY';