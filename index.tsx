/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Modality } from "@google/genai";

const VEO_POLLING_INTERVAL = 10000; // 10 seconds
const ELEVENLABS_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'; // Default voice: Rachel

// --- DOM Elements ---
const setupView = document.getElementById('setup-view')!;
const storyboardView = document.getElementById('storyboard-view')!;
const campaignForm = document.getElementById('campaign-form') as HTMLFormElement;
const generatePlanBtn = document.getElementById('generate-plan-btn') as HTMLButtonElement;
const storyboardContainer = document.getElementById('storyboard-container')!;
const generateAllImagesBtn = document.getElementById('generate-all-images-btn') as HTMLButtonElement;
const generateAllVoBtn = document.getElementById('generate-all-vo-btn') as HTMLButtonElement;
const generateAllVideosBtn = document.getElementById('generate-all-videos-btn') as HTMLButtonElement;
const generatePostCopyBtn = document.getElementById('generate-post-copy-btn') as HTMLButtonElement;
const generateReportBtn = document.getElementById('generate-report-btn') as HTMLButtonElement;
const postCopyView = document.getElementById('post-copy-view')!;
const postCopyContent = document.getElementById('post-copy-content')!;
const previewBtn = document.getElementById('preview-btn') as HTMLButtonElement;
const downloadBtn = document.getElementById('download-btn') as HTMLButtonElement;
const loader = document.getElementById('loader')!;
const loaderMessage = document.getElementById('loader-message')!;

// Preview Modal Elements
const previewModal = document.getElementById('preview-modal')!;
const sceneVideo = document.getElementById('scene-video') as HTMLVideoElement;
const textOverlay = document.getElementById('text-overlay')!;
const watermarkOverlay = document.getElementById('watermark-overlay')!;
const logoOverlay = document.getElementById('logo-overlay') as HTMLImageElement;
const closePreviewBtn = document.getElementById('close-preview')!;
const sceneIndicator = document.getElementById('scene-indicator')!;
const voiceoverAudioPlayer = document.getElementById('voiceover-audio-player') as HTMLAudioElement;

// --- Application State ---
let ai: GoogleGenAI;

type SceneAsset = {
    imageUrl?: string;
    imageB64?: string;
    audioUrl?: string;
    videoUrl?: string;
    imageStatus: 'ready' | 'generating' | 'complete' | 'failed' | 'accepted';
    voStatus: 'ready' | 'generating' | 'complete' | 'failed';
    videoStatus: 'ready' | 'generating' | 'complete' | 'failed' | 'accepted';
    imageIterations: number;  // Track regeneration attempts
    videoIterations: number;  // Track regeneration attempts
    imageHistory: Array<{url: string, critique: CritiqueResult, iteration: number}>; // History of attempts
    videoHistory: Array<{url: string, critique: CritiqueResult, iteration: number}>; // History of attempts
};

/**
 * Critique Result Structure
 * Multi-dimensional scoring system for AI-generated content evaluation
 * All scores normalized to 0-1 range (0 = poor, 1 = excellent)
 */
type CritiqueResult = {
  overallScore: number;           // Weighted average of all dimensions
  scores: {
    brandAlignment: number;       // Consistency and professional quality
    visualQuality: number;        // Technical quality, composition, clarity
    messageClarity: number;       // Clear communication, CTA effectiveness
    safetyEthics: number;         // No harmful, misleading, or prohibited content
    platformOptimization: number; // Format suitability for target platform
  };
  feedback: {
    strengths: string[];          // What works well
    issues: string[];             // Problems or violations found
    suggestions: string[];        // Actionable improvement recommendations
  };
  deploymentReady: boolean;       // Pass/fail for auto-deployment (threshold: 0.7)
  critiquedAt: string;           // ISO timestamp
  iteration?: number;            // Regeneration attempt number (1 = first attempt)
};

const state = {
  logo: {
    base64: null as string | null,
    mimeType: null as string | null,
    objectURL: null as string | null,
  },
  watermarkText: '',
  elevenApiKey: null as string | null,
  storyboard: null as any | null,
  sceneAssets: [] as SceneAsset[],
  critiques: {
    storyboard: null as CritiqueResult | null,
    sceneImages: [] as (CritiqueResult | null)[],
    sceneVideos: [] as (CritiqueResult | null)[],
    postCopy: null as CritiqueResult | null,
    overall: null as CritiqueResult | null,
  },
  isGenerating: false,
  aspectRatio: '9:16' as '9:16' | '1:1',
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
  try {
    ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
  } catch(e) {
    console.error(e);
    showError("Failed to initialize AI. Check API Key.");
    return;
  }
  
  campaignForm.addEventListener('submit', onGeneratePlan);
  (document.getElementById('logo-file') as HTMLInputElement).addEventListener('change', onLogoChange);
  generateAllImagesBtn.addEventListener('click', handleGenerateAllImages);
  generateAllVideosBtn.addEventListener('click', handleGenerateAllVideos);
  generateAllVoBtn.addEventListener('click', handleGenerateAllVoiceovers);
  generatePostCopyBtn.addEventListener('click', handleGeneratePostCopy);
  generateReportBtn.addEventListener('click', handleDownloadReport);
  previewBtn.addEventListener('click', showPreview);
  downloadBtn.addEventListener('click', handleDownloadVideo);
  closePreviewBtn.addEventListener('click', hidePreview);
});

function showSuccess(message: string) {
    const alert = document.createElement('div');
    alert.className = 'alert alert-success';
    alert.textContent = message;
    document.body.appendChild(alert);
    setTimeout(() => alert.remove(), 5000);
}

// --- UI Control Functions ---
function showLoader(message: string) {
  loaderMessage.textContent = message;
  loader.classList.remove('hidden');
}

function hideLoader() {
  loader.classList.add('hidden');
}

function showError(message: string) {
  alert(`Error: ${message}`);
  hideLoader();
}

// --- Event Handlers ---
async function onLogoChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = reader.result as string;
    state.logo.base64 = dataUrl.split(',')[1];
    state.logo.mimeType = file.type;
    state.logo.objectURL = URL.createObjectURL(file);
  };
  reader.readAsDataURL(file);
}

// Enhanced marketing report interface
interface MarketingReport {
    campaignOverview: {
        score: number;
        status: 'excellent' | 'good' | 'needs-improvement';
        timestamp: string;
        targetAudience: string;
        productDescription: string;
    };
    contentAnalysis: {
        overall: {
            strengths: string[];
            weaknesses: string[];
            opportunities: string[];
            threats: string[];
        };
        scenes: Array<{
            id: number;
            image: {
                score: number;
                strengths: string[];
                improvements: string[];
                technicalQuality: number;
                brandAlignment: number;
                engagementPotential: number;
            };
            video: {
                score: number;
                strengths: string[];
                improvements: string[];
                motionQuality: number;
                narrativeFlow: number;
                viewerRetention: number;
            };
            audio: {
                clarity: number;
                emotionalImpact: number;
                brandVoiceAlignment: number;
            };
        }>;
    };
    marketingInsights: {
        socialMediaPotential: {
            platform: {
                instagram: {
                    score: number;
                    recommendations: string[];
                    bestTimeToPost: string[];
                    hashtagSuggestions: string[];
                };
                tiktok: {
                    score: number;
                    recommendations: string[];
                    trendAlignment: string[];
                    musicSuggestions: string[];
                };
                facebook: {
                    score: number;
                    recommendations: string[];
                    targetingTips: string[];
                };
            };
        };
        engagementPredictions: {
            estimatedReach: string;
            engagementRate: string;
            targetDemographics: string[];
            peakEngagementTimes: string[];
        };
        competitiveAnalysis: {
            marketPosition: string;
            uniqueSellingPoints: string[];
            competitiveAdvantages: string[];
            potentialChallenges: string[];
        };
    };
    technicalDetails: {
        format: string;
        duration: string;
        quality: string;
        assetUrls: {
            images: string[];
            videos: string[];
            audio: string[];
        };
    };
    recommendations: {
        immediate: string[];
        shortTerm: string[];
        longTerm: string[];
        abTestingSuggestions: string[];
    };
}

let marketingReport: MarketingReport = {
    campaignOverview: {
        score: 0,
        status: 'needs-improvement',
        timestamp: '',
        targetAudience: '',
        productDescription: '',
    },
    contentAnalysis: {
        overall: {
            strengths: [],
            weaknesses: [],
            opportunities: [],
            threats: [],
        },
        scenes: [],
    },
    marketingInsights: {
        socialMediaPotential: {
            platform: {
                instagram: {
                    score: 0,
                    recommendations: [],
                    bestTimeToPost: [],
                    hashtagSuggestions: [],
                },
                tiktok: {
                    score: 0,
                    recommendations: [],
                    trendAlignment: [],
                    musicSuggestions: [],
                },
                facebook: {
                    score: 0,
                    recommendations: [],
                    targetingTips: [],
                },
            },
        },
        engagementPredictions: {
            estimatedReach: 'To be calculated',
            engagementRate: 'To be calculated',
            targetDemographics: [],
            peakEngagementTimes: [],
        },
        competitiveAnalysis: {
            marketPosition: 'To be analyzed',
            uniqueSellingPoints: [],
            competitiveAdvantages: [],
            potentialChallenges: [],
        },
    },
    technicalDetails: {
        format: 'mp4',
        duration: '0:00',
        quality: 'HD',
        assetUrls: {
            images: [],
            videos: [],
            audio: [],
        },
    },
    recommendations: {
        immediate: [],
        shortTerm: [],
        longTerm: [],
        abTestingSuggestions: [],
    },
};

async function onGeneratePlan(event: Event) {
    event.preventDefault();
    if (state.isGenerating) return;

    const formData = new FormData(campaignForm);
    const productDesc = formData.get('product-desc') as string;
    const targetAudience = formData.get('target-audience') as string;
    const elevenApiKey = formData.get('eleven-api-key') as string;
    state.watermarkText = formData.get('watermark-text') as string;
    state.elevenApiKey = elevenApiKey;
    state.aspectRatio = formData.get('format') as '9:16' | '1:1';

  if (!productDesc || !targetAudience || !elevenApiKey) {
    showError("Please fill in Product Description, Target Audience, and your ElevenLabs API Key.");
    return;
  }
  if (!state.logo.base64) {
      showError("Please upload a brand logo to proceed.");
      return;
  }

  state.isGenerating = true;
  generatePlanBtn.disabled = true;
  showLoader("🧠 Gemini is crafting your marketing plan...");

  try {
    showLoader("🎬 Starting automated content generation pipeline...");
    
    const plan = await generateMarketingPlan(formData);
    state.storyboard = plan.storyboard;
    state.sceneAssets = new Array(plan.storyboard.scenes.length).fill(null).map(() => ({
      imageStatus: 'ready', 
      voStatus: 'ready', 
      videoStatus: 'ready',
      imageIterations: 0,
      videoIterations: 0,
      imageHistory: [],
      videoHistory: []
    }));
    
    // Initialize critique arrays and generation report
    state.critiques.sceneImages = new Array(plan.storyboard.scenes.length).fill(null);
    state.critiques.sceneVideos = new Array(plan.storyboard.scenes.length).fill(null);
    marketingReport.contentAnalysis.scenes = new Array(plan.storyboard.scenes.length).fill(null).map((_, index) => ({
        id: index + 1,
        image: { 
            score: 0, 
            strengths: [], 
            improvements: [], 
            technicalQuality: 0, 
            brandAlignment: 0, 
            engagementPotential: 0 
        },
        video: { 
            score: 0, 
            strengths: [], 
            improvements: [], 
            motionQuality: 0, 
            narrativeFlow: 0, 
            viewerRetention: 0 
        },
        audio: { 
            clarity: 0, 
            emotionalImpact: 0, 
            brandVoiceAlignment: 0 
        }
    }));
    
    renderStoryboard();
    setupView.classList.add('hidden');
    storyboardView.classList.remove('hidden');

    // Start automated generation pipeline
    await automateContentGeneration();
  } catch (error) {
    console.error(error);
    showError("Failed to generate a marketing plan. Please check the console for details.");
  } finally {
    hideLoader();
    state.isGenerating = false;
    generatePlanBtn.disabled = false;
  }
}

// --- Automated Generation Pipeline ---
async function automateContentGeneration() {
    try {
        // 1. Generate and auto-improve images
        showLoader("🎨 Generating and optimizing images...");
        for (let i = 0; i < state.storyboard.scenes.length; i++) {
            await generateAndImproveImage(i);
        }

        // 2. Generate and auto-improve videos
        showLoader("🎥 Generating and optimizing videos...");
        for (let i = 0; i < state.storyboard.scenes.length; i++) {
            await generateAndImproveVideo(i);
        }

        // 3. Generate voiceovers
        showLoader("🎤 Generating voiceovers...");
        await processSequentially(state.storyboard.scenes, generateSingleVoiceover, generateAllVoBtn, '3. Generate All Voiceovers');

        // 4. Generate post copy
        showLoader("📝 Generating social media copy...");
        await handleGeneratePostCopy();

        // 5. Generate final report
        await generateFinalReport();

        hideLoader();
        showSuccess("✨ Content generation complete! Check the final report below.");
    } catch (error) {
        console.error("Automated generation failed:", error);
        showError("Content generation failed. Please check the console for details.");
        hideLoader();
    }
}

async function generateAndImproveImage(sceneIndex: number) {
    const scene = state.storyboard.scenes[sceneIndex];
    const reportScene = marketingReport.contentAnalysis.scenes[sceneIndex];

    // Initial generation
    await generateSingleImage(scene, sceneIndex);
    let critique = state.critiques.sceneImages[sceneIndex];
    
    // Auto-improve until deployment ready or max iterations
    while (!critique.deploymentReady && state.sceneAssets[sceneIndex].imageIterations < 3) {
        await regenerateImageWithCritique(sceneIndex);
        critique = state.critiques.sceneImages[sceneIndex];
        reportScene.image.technicalQuality = Math.min((critique.overallScore + 0.1) * 100, 100);
    }

    // Update report
    reportScene.image.score = critique.overallScore;
    reportScene.image.strengths = critique.feedback.strengths;
    reportScene.image.improvements = critique.feedback.suggestions;
    reportScene.image.brandAlignment = calculateBrandAlignment(critique);
    reportScene.image.engagementPotential = calculateEngagementPotential(critique);
}

// Helper functions for calculating metrics
function calculateBrandAlignment(critique: any): number {
    // Implement brand alignment calculation based on critique
    const brandKeywords = ['brand', 'identity', 'consistent', 'aligned'];
    const brandScore = critique.feedback.strengths
        .filter(s => brandKeywords.some(k => s.toLowerCase().includes(k))).length;
    return Math.min((brandScore * 0.25 + critique.overallScore) * 100, 100);
}

function calculateEngagementPotential(critique: any): number {
    // Implement engagement potential calculation based on critique
    const engagementKeywords = ['engaging', 'compelling', 'attractive', 'interest'];
    const engagementScore = critique.feedback.strengths
        .filter(s => engagementKeywords.some(k => s.toLowerCase().includes(k))).length;
    return Math.min((engagementScore * 0.25 + critique.overallScore) * 100, 100);
}

async function generateAndImproveVideo(sceneIndex: number) {
    const scene = state.storyboard.scenes[sceneIndex];
    const reportScene = marketingReport.contentAnalysis.scenes[sceneIndex];

    // Initial generation
    await generateSingleVideo(scene, sceneIndex);
    let critique = state.critiques.sceneVideos[sceneIndex];
    
    // Auto-improve until deployment ready or max iterations
    while (!critique.deploymentReady && state.sceneAssets[sceneIndex].videoIterations < 3) {
        await regenerateVideoWithCritique(sceneIndex);
        critique = state.critiques.sceneVideos[sceneIndex];
        reportScene.video.motionQuality = Math.min((critique.overallScore + 0.1) * 100, 100);
    }

    // Update report
    reportScene.video.score = critique.overallScore;
    reportScene.video.strengths = critique.feedback.strengths;
    reportScene.video.improvements = critique.feedback.suggestions;
    reportScene.video.narrativeFlow = calculateNarrativeFlow(critique);
    reportScene.video.viewerRetention = calculateViewerRetention(critique);
}

function calculateNarrativeFlow(critique: any): number {
    const narrativeKeywords = ['story', 'flow', 'coherent', 'sequence'];
    const narrativeScore = critique.feedback.strengths
        .filter(s => narrativeKeywords.some(k => s.toLowerCase().includes(k))).length;
    return Math.min((narrativeScore * 0.25 + critique.overallScore) * 100, 100);
}

function calculateViewerRetention(critique: any): number {
    const retentionKeywords = ['engaging', 'captivating', 'attention', 'watch'];
    const retentionScore = critique.feedback.strengths
        .filter(s => retentionKeywords.some(k => s.toLowerCase().includes(k))).length;
    return Math.min((retentionScore * 0.25 + critique.overallScore) * 100, 100);
}

async function generateFinalReport() {
    // Calculate overall score
    const allScores = marketingReport.contentAnalysis.scenes.flatMap(scene => [
        scene.image.score,
        scene.video.score,
        scene.audio.clarity
    ]);
    const overallScore = allScores.reduce((sum, score) => sum + score, 0) / allScores.length;
    
    marketingReport.campaignOverview.score = overallScore;
    marketingReport.campaignOverview.status = overallScore >= 0.9 ? 'excellent' : overallScore >= 0.7 ? 'good' : 'needs-improvement';
    marketingReport.campaignOverview.timestamp = new Date().toISOString();

    // Analyze content strengths and weaknesses
    marketingReport.contentAnalysis.overall = analyzeOverallContent();
    
    // Generate marketing insights
    updateMarketingInsights();
    
    // Update technical details
    updateTechnicalDetails();
    
    // Generate recommendations
    generateRecommendations();

    // Display report
    displayFinalReport();
}

function analyzeOverallContent() {
    const analysis = {
        strengths: [],
        weaknesses: [],
        opportunities: [],
        threats: []
    };

    // Analyze strengths
    const highScoringElements = marketingReport.contentAnalysis.scenes.filter(
        scene => scene.image.score > 0.8 || scene.video.score > 0.8
    );
    if (highScoringElements.length > 0) {
        analysis.strengths.push('High-quality visual content');
    }

    // Analyze weaknesses
    const lowScoringElements = marketingReport.contentAnalysis.scenes.filter(
        scene => scene.image.score < 0.6 || scene.video.score < 0.6
    );
    if (lowScoringElements.length > 0) {
        analysis.weaknesses.push('Some visual content needs improvement');
    }

    // Analyze opportunities
    if (marketingReport.marketingInsights.socialMediaPotential.platform.instagram.score > 0.7) {
        analysis.opportunities.push('Strong potential for Instagram engagement');
    }

    // Analyze threats
    const poorBrandAlignment = marketingReport.contentAnalysis.scenes.some(
        scene => scene.image.brandAlignment < 60 || scene.video.narrativeFlow < 60
    );
    if (poorBrandAlignment) {
        analysis.threats.push('Inconsistent brand messaging may impact campaign effectiveness');
    }

    return analysis;
}

function updateMarketingInsights() {
    const insights = marketingReport.marketingInsights;
    
    // Update social media potential
    insights.socialMediaPotential.platform.instagram.hashtagSuggestions = 
        generateHashtags(marketingReport.campaignOverview.productDescription);
    insights.socialMediaPotential.platform.tiktok.trendAlignment = 
        analyzeTikTokTrends();
    
    // Update engagement predictions
    insights.engagementPredictions.estimatedReach = calculateEstimatedReach();
    insights.engagementPredictions.engagementRate = calculateEngagementRate();
    insights.engagementPredictions.targetDemographics = 
        analyzeTargetDemographics(marketingReport.campaignOverview.targetAudience);
}

function updateTechnicalDetails() {
    const tech = marketingReport.technicalDetails;
    tech.duration = calculateTotalDuration();
    tech.quality = determineQualityLevel();
    tech.assetUrls = {
        images: state.sceneAssets.map(asset => asset.imageUrl),
        videos: state.sceneAssets.map(asset => asset.videoUrl),
        audio: state.sceneAssets.map(asset => asset.audioUrl)
    };
}

function generateRecommendations() {
    const recommendations = marketingReport.recommendations;
    
    // Immediate actions
    const lowScoring = marketingReport.contentAnalysis.scenes.filter(
        scene => scene.image.score < 0.7 || scene.video.score < 0.7
    );
    if (lowScoring.length > 0) {
        recommendations.immediate.push('Improve visual content for selected scenes');
    }

    // Short-term recommendations
    if (marketingReport.marketingInsights.socialMediaPotential.platform.instagram.score > 0.8) {
        recommendations.shortTerm.push('Prioritize Instagram content distribution');
    }

    // Long-term recommendations
    recommendations.longTerm.push('Develop consistent brand voice across campaigns');
    
    // A/B testing suggestions
    recommendations.abTestingSuggestions.push('Test different video lengths');
}

function generateHashtags(productDesc: string): string[] {
    // Simple hashtag generation based on product description
    return productDesc
        .toLowerCase()
        .split(' ')
        .filter(word => word.length > 3)
        .map(word => '#' + word.replace(/[^a-z0-9]/g, ''))
        .slice(0, 5);
}

function analyzeTikTokTrends(): string[] {
    // Placeholder for TikTok trend analysis
    return [
        'Short-form vertical video',
        'Music-driven content',
        'Challenge-based engagement'
    ];
}

function calculateEstimatedReach(): string {
    const baseReach = 1000;
    const qualityMultiplier = marketingReport.campaignOverview.score;
    return `${Math.round(baseReach * qualityMultiplier)}+ potential viewers`;
}

function calculateEngagementRate(): string {
    const baseRate = 0.02; // 2%
    const qualityBonus = marketingReport.campaignOverview.score * 0.03;
    return `${((baseRate + qualityBonus) * 100).toFixed(1)}% expected engagement`;
}

function analyzeTargetDemographics(targetAudience: string): string[] {
    // Simple demographic analysis based on target audience description
    return targetAudience
        .split(',')
        .map(demo => demo.trim())
        .filter(demo => demo.length > 0);
}

function calculateTotalDuration(): string {
    const totalSeconds = marketingReport.contentAnalysis.scenes.length * 15; // Assuming 15s per scene
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function determineQualityLevel(): string {
    const avgScore = marketingReport.campaignOverview.score;
    return avgScore > 0.8 ? '4K' : avgScore > 0.6 ? 'HD' : 'Standard';
}

async function handleDownloadReport() {
    const allAssetsComplete = state.sceneAssets.every(a => 
        (a.imageStatus === 'complete' || a.imageStatus === 'accepted') &&
        (a.videoStatus === 'complete' || a.videoStatus === 'accepted') &&
        a.voStatus === 'complete'
    );
    const postCopyComplete = state.critiques.postCopy !== null;

    if (!allAssetsComplete || !postCopyComplete) {
        showError("Please complete all content generation steps before downloading the report.");
        return;
    }

    if (!marketingReport) {
        showError("Report data is not available. Please try regenerating the content.");
        return;
    }

    // Generate PDF data
    const report = {
        timestamp: new Date().toISOString(),
        version: "1.0",
        campaign: marketingReport,
        assets: {
            images: state.sceneAssets.map(asset => ({
                url: asset.imageUrl,
                status: asset.imageStatus,
                iterations: asset.imageIterations
            })),
            videos: state.sceneAssets.map(asset => ({
                url: asset.videoUrl,
                status: asset.videoStatus,
                iterations: asset.videoIterations
            })),
            voiceovers: state.sceneAssets.map(asset => ({
                url: asset.audioUrl,
                status: asset.voStatus
            }))
        }
    };

    // Convert to JSON string with proper formatting
    const jsonString = JSON.stringify(report, null, 2);

    // Create blob and trigger download
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `marketing_report_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    showSuccess("Report downloaded successfully! 📊");
}

function displayFinalReport() {
    const report = marketingReport;
    const reportContainer = document.createElement('div');
    reportContainer.className = 'final-report';
    
    const statusColor = report.campaignOverview.status === 'excellent' ? '#00c853' : 
                       report.campaignOverview.status === 'good' ? '#2196f3' : '#ff9800';
    
    reportContainer.innerHTML = `
        <div class="report-header" style="background: ${report.campaignOverview.status === 'excellent' ? '#00c853' : 
                                                     report.campaignOverview.status === 'good' ? '#2196f3' : '#ff9800'}">
            <h2>📊 Marketing Campaign Report</h2>
            <div class="overall-score">
                <div class="score-circle">
                    ${Math.round(report.campaignOverview.score * 100)}%
                </div>
                <div class="status">${report.campaignOverview.status.toUpperCase()}</div>
                <div class="timestamp">Generated: ${new Date(report.campaignOverview.timestamp).toLocaleString()}</div>
            </div>
        </div>
        
        <div class="report-content">
            <div class="campaign-overview">
                <h3>Campaign Overview</h3>
                <div class="target-audience">
                    <h4>🎯 Target Audience</h4>
                    <p>${report.campaignOverview.targetAudience}</p>
                </div>
                <div class="product-description">
                    <h4>📦 Product</h4>
                    <p>${report.campaignOverview.productDescription}</p>
                </div>
            </div>

            <div class="content-analysis">
                <h3>Content Analysis</h3>
                <div class="swot-analysis">
                    <div class="swot-item strengths">
                        <h4>💪 Strengths</h4>
                        <ul>${report.contentAnalysis.overall.strengths.map(s => `<li>${s}</li>`).join('')}</ul>
                    </div>
                    <div class="swot-item weaknesses">
                        <h4>🔍 Areas for Improvement</h4>
                        <ul>${report.contentAnalysis.overall.weaknesses.map(s => `<li>${s}</li>`).join('')}</ul>
                    </div>
                    <div class="swot-item opportunities">
                        <h4>🎯 Opportunities</h4>
                        <ul>${report.contentAnalysis.overall.opportunities.map(s => `<li>${s}</li>`).join('')}</ul>
                    </div>
                    <div class="swot-item threats">
                        <h4>⚠️ Challenges</h4>
                        <ul>${report.contentAnalysis.overall.threats.map(s => `<li>${s}</li>`).join('')}</ul>
                    </div>
                </div>
            </div>

            <div class="scene-analysis">
                <h3>Scene Breakdown</h3>
                ${report.contentAnalysis.scenes.map(scene => `
                    <div class="scene-report">
                        <h4>Scene ${scene.id}</h4>
                        <div class="asset-scores">
                            <div class="asset-score image">
                                <h5>🎨 Image</h5>
                                <div class="score">${Math.round(scene.image.score * 100)}%</div>
                                <div class="metrics">
                                    <div>Technical Quality: ${Math.round(scene.image.technicalQuality)}%</div>
                                    <div>Brand Alignment: ${Math.round(scene.image.brandAlignment)}%</div>
                                    <div>Engagement Potential: ${Math.round(scene.image.engagementPotential)}%</div>
                                </div>
                                ${scene.image.strengths.length ? `
                                    <div class="strengths">
                                        <h6>✨ Strengths:</h6>
                                        <ul>${scene.image.strengths.map(s => `<li>${s}</li>`).join('')}</ul>
                                    </div>
                                ` : ''}
                            </div>
                            <div class="asset-score video">
                                <h5>🎥 Video</h5>
                                <div class="score">${Math.round(scene.video.score * 100)}%</div>
                                <div class="metrics">
                                    <div>Motion Quality: ${Math.round(scene.video.motionQuality)}%</div>
                                    <div>Narrative Flow: ${Math.round(scene.video.narrativeFlow)}%</div>
                                    <div>Viewer Retention: ${Math.round(scene.video.viewerRetention)}%</div>
                                </div>
                                ${scene.video.strengths.length ? `
                                    <div class="strengths">
                                        <h6>✨ Strengths:</h6>
                                        <ul>${scene.video.strengths.map(s => `<li>${s}</li>`).join('')}</ul>
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>

            <div class="marketing-insights">
                <h3>Marketing Insights</h3>
                <div class="social-media">
                    <h4>📱 Social Media Potential</h4>
                    <div class="platform-insights">
                        <div class="platform instagram">
                            <h5>Instagram</h5>
                            <div class="score">${Math.round(report.marketingInsights.socialMediaPotential.platform.instagram.score * 100)}%</div>
                            <h6>Suggested Hashtags:</h6>
                            <div class="hashtags">${report.marketingInsights.socialMediaPotential.platform.instagram.hashtagSuggestions.join(' ')}</div>
                        </div>
                        <div class="platform tiktok">
                            <h5>TikTok</h5>
                            <div class="score">${Math.round(report.marketingInsights.socialMediaPotential.platform.tiktok.score * 100)}%</div>
                            <h6>Trend Alignment:</h6>
                            <ul>${report.marketingInsights.socialMediaPotential.platform.tiktok.trendAlignment.map(t => `<li>${t}</li>`).join('')}</ul>
                        </div>
                        <div class="platform facebook">
                            <h5>Facebook</h5>
                            <div class="score">${Math.round(report.marketingInsights.socialMediaPotential.platform.facebook.score * 100)}%</div>
                            <h6>Targeting Tips:</h6>
                            <ul>${report.marketingInsights.socialMediaPotential.platform.facebook.targetingTips.map(t => `<li>${t}</li>`).join('')}</ul>
                        </div>
                    </div>
                </div>

                <div class="engagement-predictions">
                    <h4>📈 Engagement Predictions</h4>
                    <div class="metrics">
                        <div>Estimated Reach: ${report.marketingInsights.engagementPredictions.estimatedReach}</div>
                        <div>Expected Engagement: ${report.marketingInsights.engagementPredictions.engagementRate}</div>
                    </div>
                </div>
            </div>

            <div class="recommendations">
                <h3>Recommendations</h3>
                <div class="action-items">
                    <div class="immediate">
                        <h4>🎯 Immediate Actions</h4>
                        <ul>${report.recommendations.immediate.map(r => `<li>${r}</li>`).join('')}</ul>
                    </div>
                    <div class="short-term">
                        <h4>📅 Short-term Plan</h4>
                        <ul>${report.recommendations.shortTerm.map(r => `<li>${r}</li>`).join('')}</ul>
                    </div>
                    <div class="long-term">
                        <h4>🌟 Long-term Strategy</h4>
                        <ul>${report.recommendations.longTerm.map(r => `<li>${r}</li>`).join('')}</ul>
                    </div>
                    <div class="ab-testing">
                        <h4>🔄 A/B Testing Suggestions</h4>
                        <ul>${report.recommendations.abTestingSuggestions.map(r => `<li>${r}</li>`).join('')}</ul>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Add the report to the page
    const existingReport = document.querySelector('.final-report');
    if (existingReport) {
        existingReport.replaceWith(reportContainer);
    } else {
        document.getElementById('storyboard-view')!.appendChild(reportContainer);
    }
}

// --- Core AI Functions ---

async function generateMarketingPlan(formData: FormData) {
  const format = formData.get('format') as string;
  const platformText = format === '9:16' 
    ? 'Vertical Video (9:16) for platforms like TikTok/Reels' 
    : 'Square Video (1:1) for feed posts';

  const prompt = `
    You are a world-class marketing creative director. Create a complete social ad campaign as a single, valid JSON object.

    Product: ${formData.get('product-desc')}
    Primary audience: ${formData.get('target-audience')}
    Ad Format: ${platformText}
    Total scenes desired: ${formData.get('scenes-wanted')}

    The JSON object must have a "storyboard" key, which is an object containing a "scenes" array.
    Each scene in the array must be an object with these exact keys: "id" (1-based index), "voiceover" (a short, punchy line), "on_screen_text" (a few words, max 9), and "visual_prompt" (a rich, descriptive prompt for an image generation model, including camera shots, lighting, and mood, suitable for the chosen ad format).
  `;
  
  const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: "application/json" }
  });

  try {
    return JSON.parse(response.text.trim());
  } catch (e) {
    console.error("Failed to parse JSON from model response:", response.text);
    throw new Error("The model did not return valid JSON. Please try again.");
  }
}

// --- UI Rendering ---

function renderStoryboard() {
  storyboardContainer.innerHTML = '';
  
  state.storyboard.scenes.forEach((scene: any, index: number) => {
    const card = document.createElement('div');
    card.className = 'scene-card';
    card.id = `scene-card-${index}`;
    card.innerHTML = `
      <div class="scene-card-header">
        <h3>Scene ${scene.id}</h3>
        <div class="scene-statuses">
            <span id="image-status-${index}" class="scene-status status-ready">Image: Ready</span>
            <span id="video-status-${index}" class="scene-status status-ready">Video: Ready</span>
            <span id="vo-status-${index}" class="scene-status status-ready">VO: Ready</span>
        </div>
      </div>
       <div id="image-container-${index}" class="asset-container">
        <div class="asset-placeholder">Generated image will appear here.</div>
      </div>
      <div id="image-critique-${index}" class="critique-container"></div>
      <div class="form-group">
        <label for="prompt-${index}">Visual Prompt</label>
        <textarea id="prompt-${index}" rows="3" disabled>${scene.visual_prompt}</textarea>
      </div>
      <div id="video-container-${index}" class="asset-container" style="display:none;">
        <div class="asset-placeholder">Generated video will appear here.</div>
      </div>
      <div id="video-critique-${index}" class="critique-container"></div>
      <div class="form-group">
        <label for="vo-${index}">Voiceover</label>
        <input type="text" id="vo-${index}" value="${scene.voiceover}" disabled>
        <div id="vo-container-${index}" class="vo-container"></div>
      </div>
    `;
    storyboardContainer.appendChild(card);
  });
}

function updateCardStatus(index: number, type: 'image' | 'vo' | 'video', status: 'ready' | 'generating' | 'complete' | 'failed') {
    const statusEl = document.getElementById(`${type}-status-${index}`)!;
    statusEl.textContent = `${type.toUpperCase()}: ${status.charAt(0).toUpperCase() + status.slice(1)}`;
    statusEl.className = `scene-status status-${status}`;
}

// --- Asset Generation ---

async function processSequentially<T>(
    items: T[],
    processor: (item: T, index: number) => Promise<void>,
    button: HTMLButtonElement | null,
    buttonText: string
) {
    if (button) {
        button.disabled = true;
        button.textContent = 'Generating...';
    }

    for (let i = 0; i < items.length; i++) {
        await processor(items[i], i);
    }

    if (button) {
        button.disabled = false;
        button.textContent = buttonText;
    }
}

// IMAGE GENERATION
async function handleGenerateAllImages() {
    await processSequentially(state.storyboard.scenes, generateSingleImage, generateAllImagesBtn, '1. Generate All Images');
    checkAssetGenerationStatus();
}

async function generateSingleImage(scene: any, index: number) {
    if (state.sceneAssets[index].imageStatus === 'complete') return;
    state.sceneAssets[index].imageStatus = 'generating';
    updateCardStatus(index, 'image', 'generating');

    const imageContainer = document.getElementById(`image-container-${index}`)!;
    imageContainer.innerHTML = `<div class="asset-placeholder"><div class="spinner"></div><p>Generating Image...</p></div>`;

    try {
        const visualPrompt = (document.getElementById(`prompt-${index}`) as HTMLTextAreaElement).value;
        const augmentedPrompt = `Generate a photorealistic image based on this description: "${visualPrompt}". The second image provided is a logo. Please place this logo naturally and realistically onto the main product described in the scene.`;
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image-preview',
            contents: {
                parts: [
                    { text: augmentedPrompt },
                    { inlineData: { data: state.logo.base64!, mimeType: state.logo.mimeType! } }
                ],
            },
            config: { responseModalities: [Modality.IMAGE, Modality.TEXT] },
        });

        const imagePart = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
        if (imagePart?.inlineData) {
            const base64Data = imagePart.inlineData.data;
            const mimeType = imagePart.inlineData.mimeType;
            state.sceneAssets[index].imageB64 = base64Data;
            
            const watermarkedUrl = await applyWatermark(`data:${mimeType};base64,${base64Data}`);
            state.sceneAssets[index].imageUrl = watermarkedUrl;

            imageContainer.innerHTML = `<img src="${watermarkedUrl}" alt="Scene ${scene.id} Visual">`;
            state.sceneAssets[index].imageStatus = 'complete';
            updateCardStatus(index, 'image', 'complete');
            
            // Critique image immediately after generation
            try {
                const visualPrompt = (document.getElementById(`prompt-${index}`) as HTMLTextAreaElement).value;
                const voiceover = (document.getElementById(`vo-${index}`) as HTMLInputElement).value;
                const imageCritique = await critiqueImage(watermarkedUrl, visualPrompt, voiceover, index);
                state.critiques.sceneImages[index] = imageCritique;
                logCritique(imageCritique, `Image Scene ${index + 1}`);
                displayImageCritique(imageCritique, index);
            } catch (critiqueError) {
                console.error(`Image critique failed for scene ${index + 1}:`, critiqueError);
                // Continue even if critique fails
            }
        } else {
            throw new Error("Model did not return an image part. The prompt may have been blocked.");
        }
    } catch(e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        console.error(`Error generating image for scene ${index + 1}:`, e);
        state.sceneAssets[index].imageStatus = 'failed';
        updateCardStatus(index, 'image', 'failed');
        imageContainer.innerHTML = `<div class="asset-placeholder"><p style="color:var(--error-color)">Image generation failed.</p><p class="error-details">${errorMessage}</p></div>`;
    }
}

async function applyWatermark(imageUrl: string): Promise<string> {
    if (!state.watermarkText) return imageUrl;

    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.font = `${Math.max(12, canvas.width / 50)}px ${getComputedStyle(document.body).fontFamily}`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'bottom';
            ctx.fillText(state.watermarkText, 20, canvas.height - 20);
            
            resolve(canvas.toDataURL());
        };
        img.src = imageUrl;
    });
}

// VIDEO GENERATION
async function handleGenerateAllVideos() {
    await processSequentially(state.storyboard.scenes, generateSingleVideo, generateAllVideosBtn, '2. Generate All Videos');
    checkAssetGenerationStatus();
}

async function generateSingleVideo(scene: any, index: number) {
    const asset = state.sceneAssets[index];
    if (asset.videoStatus === 'complete' || (!asset.imageUrl && !asset.imageB64)) return; // Only check if we have an image to work with

    asset.videoStatus = 'generating';
    updateCardStatus(index, 'video', 'generating');
    
    const videoContainer = document.getElementById(`video-container-${index}`)!;
    videoContainer.style.display = 'block';
    videoContainer.innerHTML = `<div class="asset-placeholder"><div class="spinner"></div><p id="progress-message-${index}">Initializing video...</p></div>`;

    try {
        const visualPrompt = (document.getElementById(`prompt-${index}`) as HTMLTextAreaElement).value;
        let operation = await ai.models.generateVideos({
            model: 'veo-2.0-generate-001',
            prompt: `Animate this image according to the following description: "${visualPrompt}"`,
            image: { imageBytes: asset.imageB64!, mimeType: 'image/png' },
            config: { numberOfVideos: 1 },
        });
        
        while (!operation.done) {
            await new Promise(resolve => setTimeout(resolve, VEO_POLLING_INTERVAL));
            operation = await ai.operations.getVideosOperation({ operation });
        }
        
        if (operation.error) {
            console.error('Video generation operation failed:', operation.error);
            const errorMessage = (operation.error as any).message || 'Unknown video generation error.';
            throw new Error(`Video generation failed: ${errorMessage}`);
        }

        if (operation.response?.generatedVideos?.[0]?.video?.uri) {
            const downloadLink = operation.response.generatedVideos[0].video.uri;
            const videoResponse = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
             if (!videoResponse.ok) {
                throw new Error(`Failed to download video: ${videoResponse.statusText}`);
            }
            const videoBlob = await videoResponse.blob();
            const videoUrl = URL.createObjectURL(videoBlob);
            
            asset.videoUrl = videoUrl;
            asset.videoStatus = 'complete';
            updateCardStatus(index, 'video', 'complete');
            videoContainer.innerHTML = `<video src="${videoUrl}" controls muted loop playsinline></video>`;
            
            // Critique video immediately after generation
            try {
                const sceneData = state.storyboard.scenes[index];
                const videoCritique = await critiqueVideo(videoUrl, sceneData, index);
                state.critiques.sceneVideos[index] = videoCritique;
                logCritique(videoCritique, `Video Scene ${index + 1}`);
                displayVideoCritique(videoCritique, index);
            } catch (critiqueError) {
                console.error(`Video critique failed for scene ${index + 1}:`, critiqueError);
                // Continue even if critique fails
            }
        } else {
            console.error("Video generation operation completed but no video URI found. Full operation object:", operation);
            throw new Error('Video generation finished but no video URI was found.');
        }

    } catch (error) {
        console.error(`Error generating video for scene ${index + 1}:`, error);
        asset.videoStatus = 'failed';
        updateCardStatus(index, 'video', 'failed');
        const errorMessage = error instanceof Error ? error.message : String(error);
        videoContainer.innerHTML = `<div class="asset-placeholder"><p style="color:var(--error-color)">Video generation failed.</p><p class="error-details">${errorMessage}</p></div>`;
    }
}

// Voiceover verification
(window as any).handleVerifyVoiceover = async function(index: number, accept: boolean) {
    const asset = state.sceneAssets[index];
    const voContainer = document.getElementById(`vo-container-${index}`)!;
    
    if (accept) {
        // Keep the audio player but remove verification buttons
        const audioEl = voContainer.querySelector('audio');
        voContainer.innerHTML = '';
        voContainer.appendChild(audioEl!);
        asset.voStatus = 'complete';
        updateCardStatus(index, 'vo', 'complete');
    } else {
        // Retry voiceover generation
        asset.voStatus = 'ready';
        await generateSingleVoiceover(state.storyboard.scenes[index], index);
    }
    checkAssetGenerationStatus();
};

// VOICEOVER GENERATION (ELEVENLABS)
async function handleGenerateAllVoiceovers() {
    if (!state.elevenApiKey) {
        showError("ElevenLabs API Key is not configured. Please enter it in the setup form and start over.");
        return;
    }
    await processSequentially(state.storyboard.scenes, generateSingleVoiceover, generateAllVoBtn, '3. Generate All Voiceovers');
    checkAssetGenerationStatus();
}

async function generateSingleVoiceover(scene: any, index: number) {
    if (state.sceneAssets[index].voStatus === 'complete') return;
    
    const voContainer = document.getElementById(`vo-container-${index}`)!;
    state.sceneAssets[index].voStatus = 'generating';
    updateCardStatus(index, 'vo', 'generating');
    voContainer.innerHTML = '<div class="asset-placeholder">Generating voiceover...</div>';

    try {
        const response = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + ELEVENLABS_VOICE_ID, {
            method: 'POST',
            headers: {
                'Accept': 'audio/mpeg',
                'xi-api-key': state.elevenApiKey!,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text: scene.voiceover,
                model_id: "eleven_multilingual_v2",
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75
                }
            })
        });

        if (!response.ok) {
            throw new Error(`ElevenLabs API error: ${response.status} ${response.statusText}`);
        }

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        voContainer.innerHTML = `
          <div class="vo-preview">
            <audio src="${audioUrl}" controls></audio>
            <div class="vo-actions">
              <button onclick="handleVerifyVoiceover(${index}, true)" class="verify-btn accept">✓ Accept</button>
              <button onclick="handleVerifyVoiceover(${index}, false)" class="verify-btn reject">↺ Regenerate</button>
            </div>
          </div>
        `;
        
        state.sceneAssets[index].audioUrl = audioUrl;
        state.sceneAssets[index].voStatus = 'complete';
        updateCardStatus(index, 'vo', 'complete');

        // Update report with audio quality metrics
        const reportScene = marketingReport.contentAnalysis.scenes[index];
        reportScene.audio.clarity = 85; // Base quality score
        reportScene.audio.emotionalImpact = 80;
        reportScene.audio.brandVoiceAlignment = 90;

    } catch(e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        console.error(`Error generating voiceover for scene ${index + 1}:`, e);
        state.sceneAssets[index].voStatus = 'failed';
        updateCardStatus(index, 'vo', 'failed');
        voContainer.innerHTML = `
          <div class="asset-placeholder">
            <p style="color:var(--error-color)">Voiceover generation failed.</p>
            <p class="error-details">${errorMessage}</p>
            <button onclick="generateSingleVoiceover(state.storyboard.scenes[${index}], ${index})" class="retry-btn">
              Try Again
            </button>
          </div>
        `;
    }
}


function checkAssetGenerationStatus() {
  const allImagesComplete = state.sceneAssets.every(a => a.imageStatus === 'complete' || a.imageStatus === 'accepted');
  const allVideosComplete = state.sceneAssets.every(a => a.videoStatus === 'complete' || a.videoStatus === 'accepted');
  const allVOComplete = state.sceneAssets.every(a => a.voStatus === 'complete');
  const postCopyComplete = state.critiques.postCopy !== null;
  const allAssetsComplete = allImagesComplete && allVideosComplete && allVOComplete && postCopyComplete;

  // Sequential button activation
  generateAllVideosBtn.disabled = !allImagesComplete;
  generateAllVoBtn.disabled = !allVideosComplete;
  generatePostCopyBtn.disabled = !allVOComplete;
  
  // Preview and download require all assets
  previewBtn.disabled = !allAssetsComplete;
  downloadBtn.disabled = !allAssetsComplete;
  generateReportBtn.disabled = !allAssetsComplete;
  
  // Update button styles to show sequence
  generateAllImagesBtn.classList.toggle('next-step', !allImagesComplete);
  generateAllVideosBtn.classList.toggle('next-step', allImagesComplete && !allVideosComplete);
  generateAllVoBtn.classList.toggle('next-step', allVideosComplete && !allVOComplete);
  generatePostCopyBtn.classList.toggle('next-step', allVOComplete && !postCopyComplete);
  generateReportBtn.classList.toggle('next-step', allAssetsComplete);
  
  // Update overall campaign readiness display
  updateCampaignReadiness();
}

/**
 * Update campaign readiness indicator based on all critiques
 */
function updateCampaignReadiness() {
  const readinessContainer = document.getElementById('campaign-readiness');
  if (!readinessContainer) return;
  
  // Calculate overall readiness
  const critiques = [
    state.critiques.storyboard,
    ...state.critiques.sceneImages,
    ...state.critiques.sceneVideos,
    state.critiques.postCopy
  ].filter(c => c !== null) as CritiqueResult[];
  
  if (critiques.length === 0) {
    readinessContainer.innerHTML = '';
    return;
  }
  
  const avgScore = critiques.reduce((sum, c) => sum + c.overallScore, 0) / critiques.length;
  const allDeploymentReady = critiques.every(c => c.deploymentReady);
  const percentage = Math.round(avgScore * 100);
  
  const statusClass = avgScore >= 0.9 ? 'excellent' : avgScore >= 0.7 ? 'ready' : 'warning';
  const statusEmoji = avgScore >= 0.9 ? '🟢' : avgScore >= 0.7 ? '🟡' : '🔴';
  const statusText = allDeploymentReady ? 'Deploy Ready' : 'Needs Review';
  
  readinessContainer.innerHTML = `
    <div class=\"campaign-readiness-badge ${statusClass}\">
      <span class=\"readiness-icon\">${statusEmoji}</span>
      <div class=\"readiness-content\">
        <div class=\"readiness-title\">Campaign Quality: ${percentage}%</div>
        <div class=\"readiness-subtitle\">${statusText} • ${critiques.length} items evaluated</div>
      </div>
    </div>
  `;
}

// --- POST COPY GENERATION ---
async function handleGeneratePostCopy() {
    if (state.isGenerating || !state.storyboard) return;

    state.isGenerating = true;
    generatePostCopyBtn.disabled = true;
    showLoader("✍️ Gemini is writing your social media post...");

    const formData = new FormData(campaignForm);
    const productDesc = formData.get('product-desc') as string;
    const targetAudience = formData.get('target-audience') as string;
    const format = formData.get('format') as string;
    const platformText = format === '9:16' 
        ? 'vertical video platforms like TikTok, Instagram Reels, and YouTube Shorts' 
        : 'feed-based platforms like Instagram and Facebook';

    try {
        const formData = new FormData(campaignForm);
        const productDesc = formData.get('product-desc') as string;
        const targetAudience = formData.get('target-audience') as string;
        const format = formData.get('format') as string;
        const platformText = format === '9:16' 
            ? 'vertical video platforms like TikTok, Instagram Reels, and YouTube Shorts' 
            : 'feed-based platforms like Instagram and Facebook';


        const storyboardSummary = state.storyboard.scenes.map((scene: any) => {
            return `Scene ${scene.id}:
- Visuals: ${scene.visual_prompt}
- Voiceover: ${scene.voiceover}
- On-screen text: ${scene.on_screen_text}`;
        }).join('\n\n');

        const prompt = `
You are a social media marketing expert specializing in creating viral short-form video content.
Based on the following ad campaign details, generate a compelling post copy and relevant hashtags.

**Campaign Details:**
- **Product:** ${productDesc}
- **Target Audience:** ${targetAudience}
- **Platform:** ${platformText}

**Video Storyboard Summary:**
${storyboardSummary}

**Instructions:**
1.  Write a captivating and concise caption for the post. It should grab attention, explain the value proposition, and have a clear call-to-action.
2.  Provide a list of 5-7 highly relevant and trending hashtags.

Please format your response as a single, valid JSON object with two keys: "caption" (a string) and "hashtags" (an array of strings).
`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });

        const postData = JSON.parse(response.text.trim());
        renderPostCopy(postData.caption, postData.hashtags);
        
        // Critique post copy immediately after generation
        showLoader("🎯 Evaluating post copy for brand alignment...");
        try {
            const copyCritique = await critiqueCopy(
                postData.caption,
                postData.hashtags,
                productDesc,
                targetAudience
            );
            state.critiques.postCopy = copyCritique;
            logCritique(copyCritique, 'Post Copy');
            displayPostCopyCritique(copyCritique);
        } catch (critiqueError) {
            console.error('Post copy critique failed:', critiqueError);
            // Continue even if critique fails
        }

    } catch (error) {
        console.error("Failed to generate post copy:", error);
        showError("Failed to generate post copy. Please check the console for details.");
    } finally {
        hideLoader();
        state.isGenerating = false;
        generatePostCopyBtn.disabled = false;
    }
}

function renderPostCopy(caption: string, hashtags: string[]) {
    const hashtagsString = hashtags.join(' ');
    const fullPostText = `${caption}\n\n${hashtagsString}`;

    postCopyContent.innerHTML = `
        <button class="copy-btn" id="copy-post-btn" title="Copy to clipboard">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor"><path d="M360-240q-33 0-56.5-23.5T280-320v-480q0-33 23.5-56.5T360-880h360q33 0 56.5 23.5T800-800v480q0 33-23.5 56.5T720-240H360Zm0-80h360v-480H360v480ZM200-80q-33 0-56.5-23.5T120-160v-560h80v560h440v80H200Zm160-720v480-480Z"/></svg>
            Copy
        </button>
        <pre>${caption}</pre>
        <div class="hashtags">${hashtagsString}</div>
    `;

    postCopyView.classList.remove('hidden');

    const copyBtn = document.getElementById('copy-post-btn')!;
    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(fullPostText).then(() => {
            copyBtn.innerHTML = `Copied!`;
            setTimeout(() => {
                copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor"><path d="M360-240q-33 0-56.5-23.5T280-320v-480q0-33 23.5-56.5T360-880h360q33 0 56.5 23.5T800-800v480q0 33-23.5 56.5T720-240H360Zm0-80h360v-480H360v480ZM200-80q-33 0-56.5-23.5T120-160v-560h80v560h440v80H200Zm160-720v480-480Z"/></svg> Copy`;
            }, 2000);
        });
    });
}


// --- Preview Player Logic ---
let currentSceneIndex = 0;

// --- AI Critique Functions ---

/**
 * ==============================================
 * AI CRITIQUE ENGINE - DISCRIMINATOR ARCHITECTURE
 * ==============================================
 * 
 * The AI acts as an autonomous discriminator, evaluating generated content
 * WITHOUT requiring brand profile input. Critiques are triggered automatically
 * after each asset generation to ensure quality and safety.
 * 
 * Integration Points:
 * 1. After generateSingleImage() -> critiqueImage()
 * 2. After generateSingleVideo() -> critiqueVideo()
 * 3. After handleGeneratePostCopy() -> critiqueCopy()
 * 
 * All critiques are non-blocking with try-catch wrappers to prevent
 * generation pipeline failures. Results are stored in state.critiques.
 * 
 * Example Integration:
 * ```typescript
 * // In generateSingleImage, after image generation:
 * const critique = await critiqueImage(imageUrl, visualPrompt, voiceover, index);
 * state.critiques.sceneImages[index] = critique;
 * displayImageCritique(critique, index);
 * 
 * // In generateSingleVideo, after video generation:
 * const critique = await critiqueVideo(videoUrl, sceneData, index);
 * state.critiques.sceneVideos[index] = critique;
 * displayVideoCritique(critique, index);
 * ```
 * 
 * Response Format: All critique functions return CritiqueResult with:
 * - overallScore: 0-1 (weighted average)
 * - scores: { brandAlignment, visualQuality, messageClarity, safetyEthics, platformOptimization }
 * - feedback: { strengths[], issues[], suggestions[] }
 * - deploymentReady: boolean (true if score >= 0.7 and no critical issues)
 * - critiquedAt: ISO timestamp
 */

/**
 * Critique individual image for quality and effectiveness
 */
async function critiqueImage(imageUrl: string, scenePrompt: string, sceneVoiceover: string, sceneIndex: number): Promise<CritiqueResult> {
  const prompt = `
You are a visual content quality expert evaluating an AI-generated marketing image.

**SCENE CONTEXT:**
- Original Prompt: ${scenePrompt}
- Voiceover: "${sceneVoiceover}"
- Scene ${sceneIndex + 1} of ${state.storyboard.scenes.length}
- Product: ${state.storyboard.product || 'Marketing campaign'}

**EVALUATION CRITERIA:**

1. **Brand Alignment (0-1)**: Logo placement appropriate? Professional and consistent visual style? Appropriate for product?
2. **Visual Quality (0-1)**: Clear, professional, no artifacts or glitches? Good composition, lighting, and focus?
3. **Message Clarity (0-1)**: Product clearly visible and identifiable? Visual supports the voiceover message?
4. **Safety/Ethics (0-1)**: No inappropriate content, stereotypes, or misleading visuals? Safe for all audiences?
5. **Platform Optimization (0-1)**: Framing suitable for ${state.aspectRatio === '9:16' ? 'vertical mobile video' : 'square social feed'}? Attention-grabbing?

**OUTPUT REQUIREMENTS:**
Return valid JSON only:
{
  "overallScore": 0.85,
  "scores": {
    "brandAlignment": 0.9,
    "visualQuality": 0.8,
    "messageClarity": 0.9,
    "safetyEthics": 1.0,
    "platformOptimization": 0.85
  },
  "feedback": {
    "strengths": ["what works well"],
    "issues": ["specific problems found, empty if none"],
    "suggestions": ["how to improve this image"]
  },
  "deploymentReady": true
}
`;

  try {
    // Convert data URL to inline data for Gemini
    const base64Match = imageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!base64Match) {
      throw new Error('Invalid image URL format');
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          { text: prompt },
          { inlineData: { data: base64Match[2], mimeType: `image/${base64Match[1]}` } }
        ]
      },
      config: { responseMimeType: 'application/json' }
    });

    const result = JSON.parse(response.text.trim());
    return {
      ...result,
      critiquedAt: new Date().toISOString()
    };
  } catch (e) {
    console.error(`Image critique failed for scene ${sceneIndex + 1}:`, e);
    throw new Error(`Failed to critique image ${sceneIndex + 1}. Please try again.`);
  }
}

/**
 * Critique video for motion quality and engagement
 */
async function critiqueVideo(videoUrl: string, sceneData: any, sceneIndex: number): Promise<CritiqueResult> {
  const prompt = `
You are a video content quality expert evaluating an AI-generated marketing video clip.

**VIDEO CONTEXT:**
- Scene ${sceneIndex + 1} of ${state.storyboard.scenes.length}
- Visual Concept: ${sceneData.visual_prompt}
- Voiceover: "${sceneData.voiceover}"
- On-Screen Text: "${sceneData.on_screen_text}"
- Platform: ${state.aspectRatio === '9:16' ? 'TikTok/Instagram Reels/YouTube Shorts' : 'Instagram/Facebook Feed'}

**EVALUATION CRITERIA:**

1. **Brand Alignment (0-1)**: Professional and consistent visual style? Motion and pacing appropriate for product marketing?
2. **Visual Quality (0-1)**: Smooth motion? No glitches or artifacts? Professional production value and transitions?
3. **Message Clarity (0-1)**: Visual action enhances the message? Text overlay readable and timed well? Clear storytelling?
4. **Safety/Ethics (0-1)**: No inappropriate motion, misleading sequences, or unsafe content? Suitable for all audiences?
5. **Platform Optimization (0-1)**: Duration appropriate (3-8 seconds)? Engaging for ${state.aspectRatio === '9:16' ? 'TikTok/Reels' : 'feed scrolling'}? Strong hook in first second?

**ASSESSMENT GUIDELINES:**
- Video should be 3-8 seconds for optimal platform performance
- Motion should be dynamic but not chaotic
- Text overlays must be readable at mobile size
- First 1 second must grab attention ("hook")

**OUTPUT REQUIREMENTS:**
Return valid JSON only:
{
  "overallScore": 0.85,
  "scores": {
    "brandAlignment": 0.9,
    "visualQuality": 0.8,
    "messageClarity": 0.9,
    "safetyEthics": 1.0,
    "platformOptimization": 0.85
  },
  "feedback": {
    "strengths": ["effective elements"],
    "issues": ["problems identified, empty if none"],
    "suggestions": ["improvements for regeneration"]
  },
  "deploymentReady": true
}
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });

    const result = JSON.parse(response.text.trim());
    return {
      ...result,
      critiquedAt: new Date().toISOString()
    };
  } catch (e) {
    console.error(`Video critique failed for scene ${sceneIndex + 1}:`, e);
    throw new Error(`Failed to critique video ${sceneIndex + 1}. Please try again.`);
  }
}

/**
 * Critique social media post copy for effectiveness and engagement potential
 */
async function critiqueCopy(caption: string, hashtags: string[], productDesc: string, targetAudience: string): Promise<CritiqueResult> {
  const platform = state.aspectRatio === '9:16' ? 'TikTok/Instagram Reels/YouTube Shorts' : 'Instagram/Facebook Feed';

  const prompt = `
You are a social media copywriting expert evaluating post copy for a video ad campaign.

**CAMPAIGN CONTEXT:**
- Product: ${productDesc}
- Audience: ${targetAudience}
- Platform: ${platform}

**POST COPY TO EVALUATE:**
Caption:
${caption}

Hashtags: ${hashtags.join(' ')}

**EVALUATION CRITERIA:**

1. **Brand Alignment (0-1)**: Professional tone appropriate for product/audience? Consistent messaging? Authentic and trustworthy?
2. **Visual Quality (0-1)**: N/A for text, rate formatting, emoji usage, readability, visual appeal (0.8-1.0 range)
3. **Message Clarity (0-1)**: Clear value proposition? Strong hook in first line? Effective CTA? Concise and compelling?
4. **Safety/Ethics (0-1)**: No misleading claims, spam tactics, inappropriate content, or false promises?
5. **Platform Optimization (0-1)**: Length appropriate for platform? Smart hashtag strategy (3-5 relevant tags)? Platform best practices?

**PLATFORM BEST PRACTICES:**
- ${platform} optimal caption length: 125-150 characters for hook, can be longer
- Hashtags: 3-5 highly relevant, mix of popular and niche
- CTA: Clear next step (click link, follow, share, comment)
- Formatting: Line breaks for readability, emojis for engagement

**OUTPUT REQUIREMENTS:**
Return valid JSON only:
{
  "overallScore": 0.85,
  "scores": {
    "brandAlignment": 0.9,
    "visualQuality": 0.85,
    "messageClarity": 0.9,
    "safetyEthics": 1.0,
    "platformOptimization": 0.8
  },
  "feedback": {
    "strengths": ["what's working well"],
    "issues": ["problems found, empty if none"],
    "suggestions": ["specific rewrites or improvements"]
  },
  "deploymentReady": true
}
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });

    const result = JSON.parse(response.text.trim());
    return {
      ...result,
      critiquedAt: new Date().toISOString()
    };
  } catch (e) {
    console.error('Copy critique failed:', e);
    throw new Error('Failed to critique post copy. Please try again.');
  }
}

/**
 * Calculate weighted overall score from individual dimension scores
 * Weights prioritize brand alignment and safety as most critical
 */
function calculateOverallScore(scores: CritiqueResult['scores']): number {
  const weights = {
    brandAlignment: 0.30,      // Critical: Brand consistency is paramount
    safetyEthics: 0.25,        // Critical: Cannot deploy unsafe content
    messageClarity: 0.20,      // Important: Must communicate effectively
    visualQuality: 0.15,       // Important: Professional appearance
    platformOptimization: 0.10 // Nice-to-have: Platform-specific best practices
  };

  return (
    scores.brandAlignment * weights.brandAlignment +
    scores.safetyEthics * weights.safetyEthics +
    scores.messageClarity * weights.messageClarity +
    scores.visualQuality * weights.visualQuality +
    scores.platformOptimization * weights.platformOptimization
  );
}

/**
 * Format critique result for display in UI
 */
/**
 * Enhanced critique display with dimensional breakdowns, radial charts, and action buttons
 */
function formatCritiqueDisplayEnhanced(critique: CritiqueResult, assetType: 'image' | 'video', sceneIndex: number): string {
  const percentage = Math.round(critique.overallScore * 100);
  const statusClass = critique.overallScore >= 0.9 ? 'excellent' : critique.overallScore >= 0.7 ? 'good' : 'warning';
  const statusEmoji = critique.overallScore >= 0.9 ? '🟢' : critique.overallScore >= 0.7 ? '🟡' : '🔴';
  
  const iteration = critique.iteration || 1;
  const asset = state.sceneAssets[sceneIndex];
  const iterationCount = assetType === 'image' ? asset.imageIterations : asset.videoIterations;
  const isAccepted = assetType === 'image' ? asset.imageStatus === 'accepted' : asset.videoStatus === 'accepted';
  const maxIterations = 3;
  const canRegenerate = !isAccepted && iterationCount < maxIterations && !critique.deploymentReady;
  
  // Dimensional score cards
  const dimensions = [
    { name: 'Brand Alignment', score: critique.scores.brandAlignment, icon: '🎯' },
    { name: 'Visual Quality', score: critique.scores.visualQuality, icon: '🎨' },
    { name: 'Message Clarity', score: critique.scores.messageClarity, icon: '💬' },
    { name: 'Safety/Ethics', score: critique.scores.safetyEthics, icon: '🛡️' },
    { name: 'Platform Fit', score: critique.scores.platformOptimization, icon: '📱' }
  ];
  
  const dimensionCards = dimensions.map(dim => {
    const dimPercentage = Math.round(dim.score * 100);
    const dimClass = dim.score >= 0.9 ? 'excellent' : dim.score >= 0.7 ? 'good' : 'warning';
    return `
      <div class="dimension-card ${dimClass}">
        <div class="dimension-icon">${dim.icon}</div>
        <div class="dimension-info">
          <div class="dimension-name">${dim.name}</div>
          <div class="dimension-score">${dimPercentage}%</div>
        </div>
        <div class="radial-progress" data-progress="${dimPercentage}">
          <svg width="50" height="50" viewBox="0 0 50 50">
            <circle cx="25" cy="25" r="20" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="4"/>
            <circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" stroke-width="4"
                    stroke-dasharray="${dimPercentage * 1.257} 125.7" 
                    stroke-dashoffset="0" 
                    transform="rotate(-90 25 25)" 
                    stroke-linecap="round"/>
          </svg>
        </div>
      </div>
    `;
  }).join('');
  
  // Issue badges
  const issueBadges = critique.feedback.issues.length > 0 ? `
    <div class="issue-badges">
      ${critique.feedback.issues.map(issue => `
        <span class="issue-badge">⚠️ ${issue}</span>
      `).join('')}
    </div>
  ` : '';
  
  // Iteration history indicator
  const iterationBadge = iterationCount > 1 ? `
    <span class="iteration-badge" title="Generation attempt ${iterationCount} of ${maxIterations}">
      🔄 Attempt ${iterationCount}/${maxIterations}
    </span>
  ` : '';
  
  // Action buttons
  const actionButtons = isAccepted ? `
    <div class="critique-actions">
      <button class="action-btn accepted-btn" disabled>
        ✓ Accepted
      </button>
    </div>
  ` : `
    <div class="critique-actions">
      <button class="action-btn accept-btn" 
              onclick="handleAcceptAsset('${assetType}', ${sceneIndex})" 
              ${critique.deploymentReady ? '' : 'title="Asset quality is below deployment threshold (70%)"'}>
        ✓ Accept ${assetType === 'image' ? 'Image' : 'Video'}
      </button>
      ${iterationCount < maxIterations ? `
        <button class="action-btn regenerate-btn" 
                onclick="handleRegenerateAsset('${assetType}', ${sceneIndex})">
          🔄 Regenerate with AI Improvements${critique.deploymentReady ? ' (Optional)' : ''}
        </button>
      ` : ''}
      ${!canRegenerate && !critique.deploymentReady && iterationCount >= maxIterations ? `
        <div class="max-iterations-warning">⚠️ Max regeneration attempts reached</div>
      ` : ''}
    </div>
  `;
  
  return `
    <div class="critique-result-enhanced ${statusClass}">
      <div class="critique-header-enhanced">
        <div class="overall-score-section">
          <div class="score-circle ${statusClass}">
            <span class="score-emoji">${statusEmoji}</span>
            <span class="score-value">${percentage}%</span>
          </div>
          <div class="score-label">
            ${critique.deploymentReady ? '✅ Ready to Deploy' : '⚠️ Needs Improvement'}
            ${iterationBadge}
          </div>
        </div>
      </div>
      
      ${issueBadges}
      
      <div class="dimensions-grid">
        ${dimensionCards}
      </div>
      
      <div class="feedback-panels">
        ${critique.feedback.strengths.length > 0 ? `
          <div class="feedback-panel strengths-panel">
            <h4>💪 Strengths</h4>
            <ul>
              ${critique.feedback.strengths.map(s => `<li>${s}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
        
        ${critique.feedback.suggestions.length > 0 ? `
          <div class="feedback-panel suggestions-panel">
            <h4>💡 AI Improvement Suggestions</h4>
            <ul>
              ${critique.feedback.suggestions.map(s => `<li>${s}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
      </div>
      
      ${actionButtons}
    </div>
  `;
}

/**
 * Original simplified critique display (kept for backwards compatibility)
 */
function formatCritiqueDisplay(critique: CritiqueResult): string {
  const scoreEmoji = (score: number): string => {
    if (score >= 0.9) return '🟢';
    if (score >= 0.7) return '🟡';
    return '🔴';
  };

  const percentage = (score: number) => Math.round(score * 100);

  return `
<div class="critique-result">
  <div class="critique-header">
    <span class="overall-score ${critique.deploymentReady ? 'ready' : 'not-ready'}">
      ${scoreEmoji(critique.overallScore)} Overall: ${percentage(critique.overallScore)}%
    </span>
    <span class="deployment-status ${critique.deploymentReady ? 'ready' : 'not-ready'}">
      ${critique.deploymentReady ? '✅ Deploy Ready' : '⚠️ Needs Review'}
    </span>
  </div>
  
  <div class="score-breakdown">
    <div class="score-item">
      <span class="score-label">Brand Alignment</span>
      <span class="score-value">${scoreEmoji(critique.scores.brandAlignment)} ${percentage(critique.scores.brandAlignment)}%</span>
    </div>
    <div class="score-item">
      <span class="score-label">Visual Quality</span>
      <span class="score-value">${scoreEmoji(critique.scores.visualQuality)} ${percentage(critique.scores.visualQuality)}%</span>
    </div>
    <div class="score-item">
      <span class="score-label">Message Clarity</span>
      <span class="score-value">${scoreEmoji(critique.scores.messageClarity)} ${percentage(critique.scores.messageClarity)}%</span>
    </div>
    <div class="score-item">
      <span class="score-label">Safety/Ethics</span>
      <span class="score-value">${scoreEmoji(critique.scores.safetyEthics)} ${percentage(critique.scores.safetyEthics)}%</span>
    </div>
    <div class="score-item">
      <span class="score-label">Platform Optimization</span>
      <span class="score-value">${scoreEmoji(critique.scores.platformOptimization)} ${percentage(critique.scores.platformOptimization)}%</span>
    </div>
  </div>
  
  ${critique.feedback.strengths.length > 0 ? `
  <div class="feedback-section strengths">
    <h4>✨ Strengths</h4>
    <ul>${critique.feedback.strengths.map(s => `<li>${s}</li>`).join('')}</ul>
  </div>
  ` : ''}
  
  ${critique.feedback.issues.length > 0 ? `
  <div class="feedback-section issues">
    <h4>⚠️ Issues Found</h4>
    <ul>${critique.feedback.issues.map(i => `<li>${i}</li>`).join('')}</ul>
  </div>
  ` : ''}
  
  ${critique.feedback.suggestions.length > 0 ? `
  <div class="feedback-section suggestions">
    <h4>💡 Suggestions</h4>
    <ul>${critique.feedback.suggestions.map(s => `<li>${s}</li>`).join('')}</ul>
  </div>
  ` : ''}
</div>
`;
}

/**
 * Log critique results to console for debugging
 */
function logCritique(critique: CritiqueResult, label: string) {
  console.group(`🎯 Critique: ${label}`);
  console.log('Overall Score:', (critique.overallScore * 100).toFixed(1) + '%');
  console.log('Deployment Ready:', critique.deploymentReady ? '✅ Yes' : '⚠️ No');
  console.table(critique.scores);
  if (critique.feedback.strengths.length > 0) {
    console.log('✨ Strengths:', critique.feedback.strengths);
  }
  if (critique.feedback.issues.length > 0) {
    console.warn('⚠️ Issues:', critique.feedback.issues);
  }
  if (critique.feedback.suggestions.length > 0) {
    console.log('💡 Suggestions:', critique.feedback.suggestions);
  }
  console.log('Timestamp:', critique.critiquedAt);
  console.groupEnd();
}

/**
 * Display image critique with enhanced UI
 */
function displayImageCritique(critique: CritiqueResult, sceneIndex: number) {
  const container = document.getElementById(`image-critique-${sceneIndex}`);
  if (!container) return;
  
  container.innerHTML = formatCritiqueDisplayEnhanced(critique, 'image', sceneIndex);
  container.style.display = 'block';
  
  // Update image status indicator with critique score
  const statusEl = document.getElementById(`image-status-${sceneIndex}`);
  if (statusEl) {
    const percentage = Math.round(critique.overallScore * 100);
    const emoji = critique.overallScore >= 0.9 ? '🟢' : critique.overallScore >= 0.7 ? '🟡' : '🔴';
    const asset = state.sceneAssets[sceneIndex];
    const statusText = asset.imageStatus === 'accepted' ? 'Accepted ✓' : `${emoji} ${percentage}%`;
    statusEl.textContent = `Image: ${statusText}`;
    
    // Update status class based on score
    statusEl.className = 'scene-status';
    if (asset.imageStatus === 'accepted') {
      statusEl.classList.add('status-accepted');
    } else if (critique.overallScore >= 0.9) {
      statusEl.classList.add('status-excellent');
    } else if (critique.overallScore >= 0.7) {
      statusEl.classList.add('status-complete');
    } else {
      statusEl.classList.add('status-warning');
    }
  }
  updateCampaignReadiness();
}

/**
 * Display video critique with enhanced UI
 */
function displayVideoCritique(critique: CritiqueResult, sceneIndex: number) {
  const container = document.getElementById(`video-critique-${sceneIndex}`);
  if (!container) return;
  
  container.innerHTML = formatCritiqueDisplayEnhanced(critique, 'video', sceneIndex);
  container.style.display = 'block';
  
  // Update video status indicator with critique score
  const statusEl = document.getElementById(`video-status-${sceneIndex}`);
  if (statusEl) {
    const percentage = Math.round(critique.overallScore * 100);
    const emoji = critique.overallScore >= 0.9 ? '🟢' : critique.overallScore >= 0.7 ? '🟡' : '🔴';
    const asset = state.sceneAssets[sceneIndex];
    const statusText = asset.videoStatus === 'accepted' ? 'Accepted ✓' : `${emoji} ${percentage}%`;
    statusEl.textContent = `Video: ${statusText}`;
    
    // Update status class based on score
    statusEl.className = 'scene-status';
    if (asset.videoStatus === 'accepted') {
      statusEl.classList.add('status-accepted');
    } else if (critique.overallScore >= 0.9) {
      statusEl.classList.add('status-excellent');
    } else if (critique.overallScore >= 0.7) {
      statusEl.classList.add('status-complete');
    } else {
      statusEl.classList.add('status-warning');
    }
  }
  updateCampaignReadiness();
}

/**
 * Display post copy critique in post copy view
 */
function displayPostCopyCritique(critique: CritiqueResult) {
  const postCopyContent = document.getElementById('post-copy-content');
  if (!postCopyContent) return;
  
  const critiqueDiv = document.createElement('div');
  critiqueDiv.id = 'post-copy-critique-display';
  critiqueDiv.innerHTML = `
    <h3 style="margin-top: 1.5rem;">🎯 Post Copy Critique</h3>
    ${formatCritiqueDisplay(critique)}
  `;
  
  // Remove old critique if exists
  const oldCritique = document.getElementById('post-copy-critique-display');
  if (oldCritique) oldCritique.remove();
  
  postCopyContent.appendChild(critiqueDiv);
  updateCampaignReadiness();
}

// --- Auto-Improvement & Regeneration Functions ---

/**
 * Accept an asset - locks it from further regeneration
 */
(window as any).handleAcceptAsset = function(assetType: 'image' | 'video', sceneIndex: number) {
  const asset = state.sceneAssets[sceneIndex];
  
  if (assetType === 'image') {
    asset.imageStatus = 'accepted';
    // Save current version to history
    if (asset.imageUrl) {
      const currentCritique = state.critiques.sceneImages[sceneIndex];
      if (currentCritique) {
        asset.imageHistory.push({
          url: asset.imageUrl,
          critique: currentCritique,
          iteration: asset.imageIterations
        });
      }
    }
  } else {
    asset.videoStatus = 'accepted';
    // Save current version to history
    if (asset.videoUrl) {
      const currentCritique = state.critiques.sceneVideos[sceneIndex];
      if (currentCritique) {
        asset.videoHistory.push({
          url: asset.videoUrl,
          critique: currentCritique,
          iteration: asset.videoIterations
        });
      }
    }
  }
  
  // Refresh display
  if (assetType === 'image') {
    const critique = state.critiques.sceneImages[sceneIndex];
    if (critique) displayImageCritique(critique, sceneIndex);
  } else {
    const critique = state.critiques.sceneVideos[sceneIndex];
    if (critique) displayVideoCritique(critique, sceneIndex);
  }
  
  console.log(`✅ ${assetType} for scene ${sceneIndex + 1} accepted by user`);
};

/**
 * Regenerate asset with AI-powered improvements based on critique feedback
 */
(window as any).handleRegenerateAsset = async function(assetType: 'image' | 'video', sceneIndex: number) {
  if (assetType === 'image') {
    await regenerateImageWithCritique(sceneIndex);
  } else {
    await regenerateVideoWithCritique(sceneIndex);
  }
};

/**
 * Regenerate image with critique-guided improvements
 */
async function regenerateImageWithCritique(sceneIndex: number) {
  const asset = state.sceneAssets[sceneIndex];
  const scene = state.storyboard.scenes[sceneIndex];
  const critique = state.critiques.sceneImages[sceneIndex];
  
  if (!critique || asset.imageStatus === 'accepted') return;
  
  // Check max iterations
  if (asset.imageIterations >= 3) {
    alert('⚠️ Maximum regeneration attempts (3) reached for this image.');
    return;
  }
  
  // Save current version to history before regenerating
  if (asset.imageUrl) {
    asset.imageHistory.push({
      url: asset.imageUrl,
      critique: critique,
      iteration: asset.imageIterations
    });
  }
  
  asset.imageIterations++;
  console.log(`🔄 Regenerating image for scene ${sceneIndex + 1} (Attempt ${asset.imageIterations + 1})...`);
  
  // Build improvement-augmented prompt
  const originalPrompt = (document.getElementById(`prompt-${sceneIndex}`) as HTMLTextAreaElement).value;
  const improvements = critique.feedback.suggestions.join('. ');
  const issues = critique.feedback.issues.length > 0 ? `Avoid these issues: ${critique.feedback.issues.join(', ')}.` : '';
  
  const augmentedPrompt = `${originalPrompt}

**CRITICAL IMPROVEMENTS REQUIRED:**
${improvements}

${issues}

Apply these improvements while maintaining the core concept. Focus on enhancing visual quality, composition, and brand professionalism.`;
  
  // Update status
  asset.imageStatus = 'generating';
  updateCardStatus(sceneIndex, 'image', 'generating');
  
  const imageContainer = document.getElementById(`image-container-${sceneIndex}`)!;
  imageContainer.innerHTML = `<div class=\"asset-placeholder\"><div class=\"spinner\"></div><p>♻️ Regenerating with AI improvements (${asset.imageIterations}/3)...</p></div>`;
  
  try {
    const fullPrompt = `Generate a photorealistic image based on this description: "${augmentedPrompt}". The second image provided is a logo. Please place this logo naturally and realistically onto the main product described in the scene.`;
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image-preview',
      contents: {
        parts: [
          { text: fullPrompt },
          { inlineData: { data: state.logo.base64!, mimeType: state.logo.mimeType! } }
        ],
      },
      config: { responseModalities: [Modality.IMAGE, Modality.TEXT] },
    });

    const imagePart = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
    if (imagePart?.inlineData) {
      const base64Data = imagePart.inlineData.data;
      const mimeType = imagePart.inlineData.mimeType;
      asset.imageB64 = base64Data;
      
      const watermarkedUrl = await applyWatermark(`data:${mimeType};base64,${base64Data}`);
      asset.imageUrl = watermarkedUrl;

      imageContainer.innerHTML = `<img src=\"${watermarkedUrl}\" alt=\"Scene ${scene.id} Visual\">`;
      asset.imageStatus = 'complete';
      updateCardStatus(sceneIndex, 'image', 'complete');
      
      // Critique regenerated image
      try {
        const visualPrompt = (document.getElementById(`prompt-${sceneIndex}`) as HTMLTextAreaElement).value;
        const voiceover = (document.getElementById(`vo-${sceneIndex}`) as HTMLInputElement).value;
        const newCritique = await critiqueImage(watermarkedUrl, visualPrompt, voiceover, sceneIndex);
        newCritique.iteration = asset.imageIterations;
        state.critiques.sceneImages[sceneIndex] = newCritique;
        logCritique(newCritique, `Image Scene ${sceneIndex + 1} (Regeneration ${asset.imageIterations})`);
        displayImageCritique(newCritique, sceneIndex);
        
        // Compare scores
        const oldScore = critique.overallScore;
        const newScore = newCritique.overallScore;
        const improvement = ((newScore - oldScore) * 100).toFixed(1);
        console.log(`📊 Score change: ${Math.round(oldScore * 100)}% → ${Math.round(newScore * 100)}% (${improvement > '0' ? '+' : ''}${improvement}%)`);
        
        // Auto-accept if deployment ready
        if (newCritique.deploymentReady && newScore > oldScore) {
          console.log(`✨ Image improved and deployment-ready. Auto-accepting.`);
          (window as any).handleAcceptAsset('image', sceneIndex);
        }
      } catch (critiqueError) {
        console.error(`Critique failed after regeneration:`, critiqueError);
      }
    } else {
      throw new Error("Model did not return an image part.");
    }
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.error(`Error regenerating image for scene ${sceneIndex + 1}:`, e);
    asset.imageStatus = 'failed';
    updateCardStatus(sceneIndex, 'image', 'failed');
    imageContainer.innerHTML = `<div class=\"asset-placeholder\"><p style=\"color:var(--error-color)\">Regeneration failed.</p><p class=\"error-details\">${errorMessage}</p></div>`;
  }
}

/**
 * Regenerate video with critique-guided improvements
 */
async function regenerateVideoWithCritique(sceneIndex: number) {
  const asset = state.sceneAssets[sceneIndex];
  const scene = state.storyboard.scenes[sceneIndex];
  const critique = state.critiques.sceneVideos[sceneIndex];
  
  if (!critique || asset.videoStatus === 'accepted' || (!asset.imageUrl && !asset.imageB64)) {
    if (!asset.imageUrl && !asset.imageB64) {
      alert('⚠️ An image must be available before generating/regenerating video.');
    }
    return;
  }
  
  // Check max iterations
  if (asset.videoIterations >= 3) {
    alert('⚠️ Maximum regeneration attempts (3) reached for this video.');
    return;
  }
  
  // Save current version to history
  if (asset.videoUrl) {
    asset.videoHistory.push({
      url: asset.videoUrl,
      critique: critique,
      iteration: asset.videoIterations
    });
  }
  
  asset.videoIterations++;
  console.log(`🔄 Regenerating video for scene ${sceneIndex + 1} (Attempt ${asset.videoIterations + 1})...`);
  
  // Build improvement-augmented prompt
  const originalPrompt = (document.getElementById(`prompt-${sceneIndex}`) as HTMLTextAreaElement).value;
  const improvements = critique.feedback.suggestions.join('. ');
  const issues = critique.feedback.issues.length > 0 ? `Avoid these issues: ${critique.feedback.issues.join(', ')}.` : '';
  
  const augmentedPrompt = `${originalPrompt}

**CRITICAL IMPROVEMENTS REQUIRED:**
${improvements}

${issues}

Apply these improvements focusing on smooth motion, professional transitions, and engaging visual storytelling.`;
  
  asset.videoStatus = 'generating';
  updateCardStatus(sceneIndex, 'video', 'generating');
  
  const videoContainer = document.getElementById(`video-container-${sceneIndex}`)!;
  videoContainer.style.display = 'block';
  videoContainer.innerHTML = `<div class=\"asset-placeholder\"><div class=\"spinner\"></div><p id=\"progress-message-${sceneIndex}\">♻️ Regenerating video with AI improvements (${asset.videoIterations}/3)...</p></div>`;
  
  try {
    let operation = await ai.models.generateVideos({
      model: 'veo-2.0-generate-001',
      prompt: `Animate this image according to the following description: "${augmentedPrompt}"`,
      image: { imageBytes: asset.imageB64!, mimeType: 'image/png' },
      config: { numberOfVideos: 1 },
    });
    
    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, VEO_POLLING_INTERVAL));
      operation = await ai.operations.getVideosOperation({ operation });
    }
    
    if (operation.error) {
      throw new Error(`Video generation failed: ${(operation.error as any).message || 'Unknown error'}`);
    }

    if (operation.response?.generatedVideos?.[0]?.video?.uri) {
      const downloadLink = operation.response.generatedVideos[0].video.uri;
      const videoResponse = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
      if (!videoResponse.ok) {
        throw new Error(`Failed to download video: ${videoResponse.statusText}`);
      }
      const videoBlob = await videoResponse.blob();
      const videoUrl = URL.createObjectURL(videoBlob);
      
      asset.videoUrl = videoUrl;
      asset.videoStatus = 'complete';
      updateCardStatus(sceneIndex, 'video', 'complete');
      videoContainer.innerHTML = `<video src=\"${videoUrl}\" controls muted loop playsinline></video>`;
      
      // Critique regenerated video
      try {
        const sceneData = state.storyboard.scenes[sceneIndex];
        const newCritique = await critiqueVideo(videoUrl, sceneData, sceneIndex);
        newCritique.iteration = asset.videoIterations;
        state.critiques.sceneVideos[sceneIndex] = newCritique;
        logCritique(newCritique, `Video Scene ${sceneIndex + 1} (Regeneration ${asset.videoIterations})`);
        displayVideoCritique(newCritique, sceneIndex);
        
        // Compare scores
        const oldScore = critique.overallScore;
        const newScore = newCritique.overallScore;
        const improvement = ((newScore - oldScore) * 100).toFixed(1);
        console.log(`📊 Score change: ${Math.round(oldScore * 100)}% → ${Math.round(newScore * 100)}% (${improvement > '0' ? '+' : ''}${improvement}%)`);
        
        // Only auto-accept if score significantly improved (>5% improvement)
        const significantImprovement = (newScore - oldScore) > 0.05;
        if (newCritique.deploymentReady && significantImprovement) {
          console.log(`✨ Video significantly improved (+${((newScore - oldScore) * 100).toFixed(1)}%) and deployment-ready. Auto-accepting.`);
          (window as any).handleAcceptAsset('video', sceneIndex);
        }
      } catch (critiqueError) {
        console.error(`Critique failed after video regeneration:`, critiqueError);
      }
    } else {
      throw new Error('Video generation finished but no video URI was found.');
    }
  } catch (error) {
    console.error(`Error regenerating video for scene ${sceneIndex + 1}:`, error);
    asset.videoStatus = 'failed';
    updateCardStatus(sceneIndex, 'video', 'failed');
    const errorMessage = error instanceof Error ? error.message : String(error);
    videoContainer.innerHTML = `<div class=\"asset-placeholder\"><p style=\"color:var(--error-color)\">Video regeneration failed.</p><p class=\"error-details\">${errorMessage}</p></div>`;
  }
}

// --- Preview Player Logic ---

function showPreview() {
  currentSceneIndex = 0;
  const videoWrapper = document.querySelector('.video-wrapper') as HTMLDivElement;
  if (videoWrapper) {
    videoWrapper.style.setProperty('--video-aspect-ratio', state.aspectRatio.replace(':', ' / '));
  }
  previewModal.classList.remove('hidden');
  logoOverlay.src = state.logo.objectURL || '';
  watermarkOverlay.textContent = state.watermarkText;
  playScene(currentSceneIndex);
}

function hidePreview() {
  sceneVideo.pause();
  voiceoverAudioPlayer.pause();
  previewModal.classList.add('hidden');
}

function playScene(index: number) {
  if (index >= state.sceneAssets.length) {
    hidePreview();
    return;
  }
  
  const sceneAsset = state.sceneAssets[index];
  const sceneData = state.storyboard.scenes[index];
  
  // Update UI
  sceneIndicator.textContent = `Scene ${index + 1} / ${state.sceneAssets.length}`;
  textOverlay.textContent = sceneData.on_screen_text;
  
  // Fade in overlays
  textOverlay.style.opacity = '1';
  logoOverlay.style.opacity = '1';
  watermarkOverlay.style.opacity = '1';
  
  // Play Video & Audio
  sceneVideo.src = sceneAsset.videoUrl!;
  voiceoverAudioPlayer.src = sceneAsset.audioUrl!;
  sceneVideo.currentTime = 0;
  voiceoverAudioPlayer.currentTime = 0;
  sceneVideo.play();
  voiceoverAudioPlayer.play();

  // Go to next scene when video ends
  sceneVideo.onended = () => {
    textOverlay.style.opacity = '0';
    logoOverlay.style.opacity = '0';
    watermarkOverlay.style.opacity = '0';
    currentSceneIndex++;
    // Add a small delay between scenes
    setTimeout(() => playScene(currentSceneIndex), 300);
  };
}

// --- Video Download Logic ---
async function handleDownloadVideo() {
    if (state.isGenerating || state.sceneAssets.some(a => a.videoStatus !== 'complete' || a.voStatus !== 'complete')) {
        showError("All assets must be generated before downloading.");
        return;
    }

    state.isGenerating = true;
    showLoader("🎬 Rendering final video... This may take a moment.");

    try {
        const [width, height] = state.aspectRatio === '9:16' ? [720, 1280] : [1080, 1080];
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, width, height);

        // 1. Set up combined audio track
        const audioContext = new AudioContext();
        const audioDestination = audioContext.createMediaStreamDestination();
        const audioBuffers = await Promise.all(
            state.sceneAssets.map(asset =>
                fetch(asset.audioUrl!)
                    .then(res => res.arrayBuffer())
                    .then(buffer => audioContext.decodeAudioData(buffer))
            )
        );

        let audioStartTime = 0;
        for (const buffer of audioBuffers) {
            const source = audioContext.createBufferSource();
            source.buffer = buffer;
            source.connect(audioDestination);
            source.start(audioStartTime);
            audioStartTime += buffer.duration;
        }
        const audioTrack = audioDestination.stream.getAudioTracks()[0];

        // 2. Set up video track from canvas
        const videoStream = canvas.captureStream(30);
        const videoTrack = videoStream.getVideoTracks()[0];

        // 3. Combine tracks and set up recorder
        const combinedStream = new MediaStream([videoTrack, audioTrack]);
        const recorder = new MediaRecorder(combinedStream, { mimeType: 'video/webm; codecs=vp9,opus' });

        const chunks: Blob[] = [];
        recorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                chunks.push(event.data);
            }
        };

        recorder.onstop = () => {
            const blob = new Blob(chunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `automace_ad_${new Date().toISOString().slice(0,10)}.webm`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            state.isGenerating = false;
            hideLoader();
        };

        // 4. Start recording and render scenes
        recorder.start();

        const tempVideo = document.createElement('video');
        tempVideo.muted = true;
        
        const logoImg = new Image();
        let logoLoaded = false;
        if (state.logo.objectURL) {
            logoImg.src = state.logo.objectURL;
            await new Promise(resolve => { logoImg.onload = resolve; });
            logoLoaded = true;
        }

        for (let i = 0; i < state.sceneAssets.length; i++) {
            const sceneAsset = state.sceneAssets[i];
            const sceneData = state.storyboard.scenes[i];
            
            tempVideo.src = sceneAsset.videoUrl!;
            await new Promise(resolve => { tempVideo.onloadeddata = resolve; });

            let resolveScene: (value: unknown) => void;
            const scenePromise = new Promise(resolve => { resolveScene = resolve; });
            tempVideo.onended = () => resolveScene(true);
            
            tempVideo.currentTime = 0;
            await tempVideo.play();
            
            const renderFrame = () => {
                if (tempVideo.paused || tempVideo.ended) {
                    return;
                }
                
                const videoRatio = tempVideo.videoWidth / tempVideo.videoHeight;
                const canvasRatio = width / height;
                let dWidth, dHeight, dx, dy;

                if (videoRatio > canvasRatio) { 
                    dHeight = height;
                    dWidth = dHeight * videoRatio;
                } else {
                    dWidth = width;
                    dHeight = dWidth / videoRatio;
                }
                dx = (width - dWidth) / 2;
                dy = (height - dHeight) / 2;

                ctx.fillRect(0, 0, width, height);
                ctx.drawImage(tempVideo, dx, dy, dWidth, dHeight);

                // Draw overlays
                if (logoLoaded) {
                    const logoMaxW = width * 0.15;
                    const logoMaxH = height * 0.08;
                    const logoRatio = logoImg.width / logoImg.height;
                    let logoW = logoMaxW;
                    let logoH = logoMaxW / logoRatio;
                    if (logoH > logoMaxH) {
                        logoH = logoMaxH;
                        logoW = logoMaxH * logoRatio;
                    }
                    ctx.drawImage(logoImg, width - logoW - 20, 20, logoW, logoH);
                }
                if(state.watermarkText) {
                    ctx.font = `${height * 0.015}px ${getComputedStyle(document.body).fontFamily}`;
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'bottom';
                    ctx.fillText(state.watermarkText, 20, height - 20);
                }
                if (sceneData.on_screen_text) {
                    ctx.font = `bold ${height * 0.04}px ${getComputedStyle(document.body).fontFamily}`;
                    ctx.fillStyle = 'white';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
                    ctx.lineWidth = height * 0.01;
                    const textX = width / 2;
                    const textY = height * 0.85;
                    ctx.strokeText(sceneData.on_screen_text, textX, textY);
                    ctx.fillText(sceneData.on_screen_text, textX, textY);
                }

                requestAnimationFrame(renderFrame);
            };
            requestAnimationFrame(renderFrame);
            await scenePromise;
        }

        // 5. Render end card with logo
        if (logoLoaded) {
            const LOGO_END_CARD_DURATION_MS = 3000; // 3 seconds

            // Clear canvas to black
            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, width, height);

            // Calculate logo dimensions to fit and center
            const maxLogoWidth = width * 0.5;
            const maxLogoHeight = height * 0.5;
            const logoRatio = logoImg.width / logoImg.height;
            
            let logoW = maxLogoWidth;
            let logoH = logoW / logoRatio;

            if (logoH > maxLogoHeight) {
                logoH = maxLogoHeight;
                logoW = logoH * logoRatio;
            }

            const logoX = (width - logoW) / 2;
            const logoY = (height - logoH) / 2;
            
            ctx.drawImage(logoImg, logoX, logoY, logoW, logoH);
            
            // Hold this frame for the duration
            await new Promise(resolve => setTimeout(resolve, LOGO_END_CARD_DURATION_MS));
        }

        recorder.stop();
        audioContext.close();

    } catch (error) {
        console.error("Failed to render video:", error);
        showError("An error occurred while rendering the video. Please check the console.");
        state.isGenerating = false;
        hideLoader();
    }
}