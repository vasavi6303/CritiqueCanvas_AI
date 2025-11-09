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
    const reportScene = generationReport.scenes[sceneIndex];

    // Initial generation
    await generateSingleImage(scene, sceneIndex);
    let critique = state.critiques.sceneImages[sceneIndex];
    
    // Auto-improve until deployment ready or max iterations
    while (!critique.deploymentReady && state.sceneAssets[sceneIndex].imageIterations < 3) {
        await regenerateImageWithCritique(sceneIndex);
        critique = state.critiques.sceneImages[sceneIndex];
        reportScene.image.iterations++;
    }

    // Update report
    reportScene.image.finalScore = critique.overallScore;
    reportScene.image.strengths = critique.feedback.strengths;
    reportScene.image.improvements = critique.feedback.suggestions;
}

async function generateAndImproveVideo(sceneIndex: number) {
    const scene = state.storyboard.scenes[sceneIndex];
    const reportScene = generationReport.scenes[sceneIndex];

    // Initial generation
    await generateSingleVideo(scene, sceneIndex);
    let critique = state.critiques.sceneVideos[sceneIndex];
    
    // Auto-improve until deployment ready or max iterations
    while (!critique.deploymentReady && state.sceneAssets[sceneIndex].videoIterations < 3) {
        await regenerateVideoWithCritique(sceneIndex);
        critique = state.critiques.sceneVideos[sceneIndex];
        reportScene.video.iterations++;
    }

    // Update report
    reportScene.video.finalScore = critique.overallScore;
    reportScene.video.strengths = critique.feedback.strengths;
    reportScene.video.improvements = critique.feedback.suggestions;
}

async function generateFinalReport() {
    // Calculate overall score
    const allScores = generationReport.scenes.flatMap(scene => [scene.image.finalScore, scene.video.finalScore]);
    const overallScore = allScores.reduce((sum, score) => sum + score, 0) / allScores.length;
    
    generationReport.overall = {
        score: overallScore,
        status: overallScore >= 0.9 ? 'excellent' : overallScore >= 0.7 ? 'good' : 'needs-improvement',
        timestamp: new Date().toISOString()
    };

    // Add post copy data
    if (state.critiques.postCopy) {
        generationReport.postCopy = {
            score: state.critiques.postCopy.overallScore,
            strengths: state.critiques.postCopy.feedback.strengths,
            improvements: state.critiques.postCopy.feedback.suggestions
        };
    }

    // Display report
    displayFinalReport();
}

function displayFinalReport() {
    const report = generationReport;
    const reportContainer = document.createElement('div');
    reportContainer.className = 'final-report';
    
    const statusColor = report.overall.status === 'excellent' ? '#00c853' : 
                       report.overall.status === 'good' ? '#2196f3' : '#ff9800';
    
    reportContainer.innerHTML = `
        <div class="report-header" style="background: ${statusColor}">
            <h2>📊 Campaign Generation Report</h2>
            <div class="overall-score">
                <div class="score-circle">
                    ${Math.round(report.overall.score * 100)}%
                </div>
                <div class="status">${report.overall.status.toUpperCase()}</div>
            </div>
        </div>
        
        <div class="report-content">
            ${report.scenes.map(scene => `
                <div class="scene-report">
                    <h3>Scene ${scene.id}</h3>
                    <div class="asset-scores">
                        <div class="asset-score">
                            <h4>🎨 Image</h4>
                            <div class="score">${Math.round(scene.image.finalScore * 100)}%</div>
                            <div class="iterations">Iterations: ${scene.image.iterations + 1}</div>
                            ${scene.image.strengths.length ? `
                                <div class="strengths">
                                    <h5>✨ Strengths:</h5>
                                    <ul>${scene.image.strengths.map(s => `<li>${s}</li>`).join('')}</ul>
                                </div>
                            ` : ''}
                        </div>
                        <div class="asset-score">
                            <h4>🎥 Video</h4>
                            <div class="score">${Math.round(scene.video.finalScore * 100)}%</div>
                            <div class="iterations">Iterations: ${scene.video.iterations + 1}</div>
                            ${scene.video.strengths.length ? `
                                <div class="strengths">
                                    <h5>✨ Strengths:</h5>
                                    <ul>${scene.video.strengths.map(s => `<li>${s}</li>`).join('')}</ul>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `).join('')}
            
            <div class="post-copy-report">
                <h3>📝 Social Media Copy</h3>
                <div class="score">${Math.round(report.postCopy.score * 100)}%</div>
                ${report.postCopy.strengths.length ? `
                    <div class="strengths">
                        <h5>✨ Strengths:</h5>
                        <ul>${report.postCopy.strengths.map(s => `<li>${s}</li>`).join('')}</ul>
                    </div>
                ` : ''}
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