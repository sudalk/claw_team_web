"""ClawTeam Web API - FastAPI application entry point."""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.core.config import settings
from backend.api import teams, tasks, agents, workers, messages, events, clis, auto


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    print(f"ClawTeam Web API starting...")
    print(f"Data directory: {settings.clawteam_dir}")
    yield
    print("ClawTeam Web API shutting down...")


app = FastAPI(
    title="ClawTeam Web API",
    description="REST API for ClawTeam multi-agent coordination platform",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(teams.router, prefix=settings.api_prefix)
app.include_router(tasks.router, prefix=settings.api_prefix)
app.include_router(agents.router, prefix=settings.api_prefix)
app.include_router(workers.router, prefix=settings.api_prefix)
app.include_router(messages.router, prefix=settings.api_prefix)
app.include_router(events.router, prefix=settings.api_prefix)
app.include_router(clis.router, prefix=settings.api_prefix)
app.include_router(auto.router, prefix=settings.api_prefix)


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": "ClawTeam Web API",
        "version": "1.0.0",
        "docs": "/docs",
    }


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "backend.main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=True,
    )
