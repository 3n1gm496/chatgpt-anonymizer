from fastapi import APIRouter, Request

from local_engine.models.api_models import HealthResponseModel

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponseModel)
async def health(request: Request) -> HealthResponseModel:
    return request.app.state.service.health()
