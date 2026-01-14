"""
Database initialization script
Tạo tables trong PostgreSQL database
"""
from app.models.database import Base, engine
from app.core.config import settings
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def init_db():
    """Initialize database tables"""
    try:
        logger.info("Creating database tables...")
        logger.info(f"Database URL: {settings.DATABASE_URL}")
        
        # Create all tables
        Base.metadata.create_all(bind=engine)
        
        logger.info("✅ Database tables created successfully!")
        logger.info("Tables: users, detection_logs, market_prices, knowledge_base")
        
    except Exception as e:
        logger.error(f"❌ Failed to create database tables: {str(e)}")
        raise

if __name__ == "__main__":
    init_db()
