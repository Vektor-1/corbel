from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from .config import settings


engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def apply_additive_schema_migrations() -> None:
    """Apply the small additive migration needed by the pilot deployment.

    PostgreSQL's ``IF NOT EXISTS`` makes this safe for both a fresh Compose
    volume and the early pilot volume created before correction provenance was
    added. Destructive or type-changing migrations remain manual operations.
    """
    if engine.dialect.name != "postgresql":
        return
    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE corrections ADD COLUMN IF NOT EXISTS proposed_geometry JSON"))
        connection.execute(text("ALTER TABLE corrections ADD COLUMN IF NOT EXISTS quality_features JSON"))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
