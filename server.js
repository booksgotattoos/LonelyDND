const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
console.log("🧭 Loaded env vars:", Object.keys(process.env));
// Load environment variables
dotenv.config();
console.log("🔑 OPENAI_API_KEY set:", !!process.env.OPENAI_API_KEY);
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.get('/', (req, res) => {
  res.send('🧙‍♂️ Welcome to Lonely D&D! The server is live. Try hitting /health or /api/characters.');
});
// In-memory storage for game data
let gameData = {
  characters: [],
  sessions: [],
  quests: [],
  locations: []
};

// Utility function to generate IDs
const generateId = () => Math.random().toString(36).substring(2) + Date.now().toString(36);

// Basic health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    openaiConfigured: !!process.env.OPENAI_API_KEY
  });
});

// Character routes
app.post('/api/characters', (req, res) => {
  try {
    const character = {
      id: generateId(),
      ...req.body,
      createdAt: new Date().toISOString()
    };
    gameData.characters.push(character);
    res.json(character);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/characters', (req, res) => {
  res.json(gameData.characters);
});

app.get('/api/characters/:id', (req, res) => {
  const character = gameData.characters.find(c => c.id === req.params.id);
  if (!character) {
    return res.status(404).json({ error: 'Character not found' });
  }
  res.json(character);
});

// DM Chat endpoint with OpenAI integration
app.post('/api/dm/chat', async (req, res) => {
  try {
    const { message, characterId, sessionId } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    let dmResponse;
    let imageUrl = null;

    // Try to use OpenAI if API key is available
    if (process.env.OPENAI_API_KEY) {
      try {
        const OpenAI = require('openai');
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        // Get character info for context
        const character = gameData.characters.find(c => c.id === characterId);
        const characterContext = character ? 
          `Character: ${character.name}, Level ${character.level} ${character.race} ${character.class}. HP: ${character.currentHp}/${character.maxHp}, AC: ${character.armorClass}` : 
          'Unknown character';

        // Generate DM response
        const response = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { 
              role: 'system', 
              content: `You are an expert Dungeon Master for a single-player D&D campaign. Create engaging, immersive responses to player actions and choices.

Current Character: ${characterContext}

Guidelines:
- Always stay in character as the DM and friend
- Respond to player actions with vivid descriptions
- Create opportunities for adventure and choice
- Include dialogue from NPCs when appropriate
- Describe scenes in detail to enhance immersion
- Include dice rolls and game mechanics when appropriate
- Create dynamic encounters based on player choices
- Make the story feel personal and epic

Respond in a way that moves the story forward and gives the player meaningful choices.`
            },
            { role: 'user', content: message }
          ],
          max_tokens: 400,
          temperature: 0.8
        });

        dmResponse = response.choices[0].message.content;

        // Generate image for dramatic moments
        if (message.toLowerCase().includes('enter') || message.toLowerCase().includes('look') || message.toLowerCase().includes('explore')) {
          try {
            const imageResponse = await openai.images.generate({
              model: 'dall-e-3',
              prompt: `Fantasy D&D scene: ${message}. High quality digital art, detailed, atmospheric, cinematic lighting, fantasy art style.`,
              n: 1,
              size: '1024x1024',
              quality: 'standard'
            });
            imageUrl = imageResponse.data[0].url;
          } catch (imageError) {
            console.error('Image generation failed:', imageError);
          }
        }

      } catch (openaiError) {
        console.error('OpenAI API error:', openaiError);
        // Fall back to mock response if OpenAI fails
        dmResponse = generateMockResponse();
      }
    } else {
      // Use mock response if no OpenAI key
      dmResponse = generateMockResponse();
    }

    function generateMockResponse() {
      const mockResponses = [
        "You find yourself standing at the entrance of a dark, mysterious cave. The air is thick with an otherworldly mist, and you can hear strange echoes coming from within. What do you do?",
        "A goblin appears from behind a tree, wielding a rusty sword! Roll for initiative! The goblin's eyes glow with malicious intent as it prepares to attack.",
        "You discover a treasure chest hidden behind some rocks. It appears to be locked with an intricate magical mechanism. Do you attempt to pick the lock, or look for another way?",
        "The tavern is bustling with activity. A hooded figure in the corner catches your eye - they seem to be watching you intently. The barkeep approaches and offers you a drink.",
        "You hear the sound of rushing water ahead. As you round the corner, you see a magnificent waterfall cascading into a crystal-clear pool. Something glitters at the bottom of the water."
      ];
      return mockResponses[Math.floor(Math.random() * mockResponses.length)];
    }
    
    // Create session if it doesn't exist
    let session = gameData.sessions.find(s => s.id === sessionId);
    if (!session) {
      session = {
        id: sessionId || generateId(),
        characterId,
        messages: [],
        currentLocation: "Starting Area",
        locationDescription: "A peaceful meadow where your adventure begins",
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      };
      gameData.sessions.push(session);
    }

    // Add messages to session
    session.messages.push({
      id: generateId(),
      role: 'user',
      content: message,
      timestamp: new Date().toISOString()
    });

    session.messages.push({
      id: generateId(),
      role: 'assistant',
      content: dmResponse,
      timestamp: new Date().toISOString(),
      imageUrl: imageUrl
    });

    session.lastUpdated = new Date().toISOString();

    res.json({
      dmResponse: {
        message: dmResponse,
        imageUrl: imageUrl
      },
      session: session
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Game sessions
app.get('/api/characters/:characterId/game-sessions', (req, res) => {
  const sessions = gameData.sessions.filter(s => s.characterId === req.params.characterId);
  res.json(sessions);
});

app.get('/api/game-sessions/:id', (req, res) => {
  const session = gameData.sessions.find(s => s.id === req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  res.json(session);
});

// Quests
app.get('/api/quests', (req, res) => {
  res.json(gameData.quests);
});

app.post('/api/quests', (req, res) => {
  const quest = {
    id: generateId(),
    ...req.body,
    createdAt: new Date().toISOString()
  };
  gameData.quests.push(quest);
  res.json(quest);
});

// Seed some initial data
function seedData() {
  // Add some sample spells
  gameData.spells = [
    {
      id: generateId(),
      name: 'Fireball',
      level: 3,
      school: 'evocation',
      castingTime: '1 action',
      range: '150 feet',
      components: 'V, S, M (a tiny ball of bat guano and sulfur)',
      duration: 'Instantaneous',
      description: 'A bright streak flashes from your pointing finger to a point you choose within range and then blossoms with a low roar into an explosion of flame.',
      ritual: false,
      concentration: false
    },
    {
      id: generateId(),
      name: 'Cure Wounds',
      level: 1,
      school: 'evocation',
      castingTime: '1 action',
      range: 'Touch',
      components: 'V, S',
      duration: 'Instantaneous',
      description: 'A creature you touch regains a number of hit points equal to 1d8 + your spellcasting ability modifier.',
      ritual: false,
      concentration: false
    }
  ];

  // Add sample character
  gameData.characters.push({
    id: generateId(),
    name: 'Adventurer',
    class: 'Fighter',
    level: 1,
    race: 'Human',
    background: 'Soldier',
    strength: 16,
    dexterity: 14,
    constitution: 15,
    intelligence: 12,
    wisdom: 13,
    charisma: 10,
    currentHp: 12,
    maxHp: 12,
    armorClass: 16,
    proficiencyBonus: 2,
    currentXp: 0,
    createdAt: new Date().toISOString()
  });
}

// Initialize with seed data
seedData();
console.log('█ Seeded characters:', gameData.characters);
// Spells endpoint
app.get('/api/spells', (req, res) => {
  res.json(gameData.spells || []);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🏰 D&D Server running on port ${PORT}`);
  console.log(`🎯 Health check: http://localhost:${PORT}/health`);
  console.log(`🎲 API available at: http://localhost:${PORT}/api`);
  
  if (process.env.OPENAI_API_KEY) {
    console.log('✅ OpenAI API key configured');
  } else {
    console.log('⚠️  OpenAI API key not found');
  }
});
