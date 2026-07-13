"""
TrueView AI – FastAPI Service Entry Point
Provides real-time AI processing pipelines.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from face_detection.router import router as face_detection_router
from face_recognition.router import router as face_recognition_router
from liveness_detection.api.router import router as liveness_router
from face_mesh.api.router import router as face_mesh_router
from gaze_tracking.api.router import router as eye_gaze_router
from head_pose.api.router import router as head_pose_router
from voice_detection.api.router import router as voice_detection_router
from object_detection.api.router import router as object_detection_router
from behaviour_analysis.api.router import router as behaviour_analysis_router

app = FastAPI(
    title="TrueView AI Service",
    description="AI-powered proctoring detection service",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware, 
    allow_origins=["*"], 
    allow_methods=["*"], 
    allow_headers=["*"]
)

@app.get("/health")
async def health():
    return {"status": "ok", "service": "trueview-ai"}

# Register AI modules
app.include_router(face_detection_router, prefix="/api/face-detection", tags=["Face Detection"])
app.include_router(face_recognition_router, prefix="/api/face-recognition", tags=["Face Recognition"])
app.include_router(liveness_router, prefix="/api/liveness", tags=["Liveness Detection"])
app.include_router(face_mesh_router, prefix="/api/face-mesh", tags=["Face Mesh"])
app.include_router(eye_gaze_router, prefix="/api/eye-gaze", tags=["Eye Gaze Tracking"])
app.include_router(head_pose_router, prefix="/api/head-pose", tags=["Head Pose"])
app.include_router(voice_detection_router, prefix="/api/voice-detection", tags=["Voice Detection"])
app.include_router(object_detection_router, prefix="/api/object-detection", tags=["Object Detection"])
app.include_router(behaviour_analysis_router, prefix="/api/behaviour-analysis", tags=["Behaviour Analysis"])

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
