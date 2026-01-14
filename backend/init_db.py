"""
Database Initialization Script
Creates all database tables from SQLAlchemy models with proper error handling and logging.

Usage:
    python init_db.py

Requirements:
    - PostgreSQL database must be running
    - DATABASE_URL must be set in .env file
"""

from sqlalchemy import inspect, text
from app.models.database import Base, engine, SessionLocal
from app.core.config import settings
import logging
import sys

# Configure logging with both console and file output
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('init_db.log')
    ]
)
logger = logging.getLogger(__name__)


def check_database_connection():
    """Test database connection before proceeding."""
    logger.info("Testing database connection...")
    db = SessionLocal()
    try:
        result = db.execute(text("SELECT version(), current_database()"))
        row = result.fetchone()
        logger.info(f"✓ Connected to database: {row[1]}")
        logger.info(f"✓ PostgreSQL version: {row[0].split(',')[0]}")
        return True
    except Exception as e:
        logger.error(f"✗ Database connection failed: {str(e)}")
        logger.error(f"Connection URL: {settings.DATABASE_URL.split('@')[1] if '@' in settings.DATABASE_URL else 'Invalid URL'}")
        return False
    finally:
        db.close()


def get_existing_tables():
    """Get list of existing tables in database."""
    inspector = inspect(engine)
    return inspector.get_table_names()


def create_tables():
    """Create all tables defined in models using transaction."""
    logger.info("Creating database tables...")
    
    db = SessionLocal()
    try:
        # Get existing tables before creation
        existing_tables = get_existing_tables()
        logger.info(f"Existing tables: {existing_tables if existing_tables else 'None'}")
        
        # Create all tables in a transaction
        with db.begin():
            Base.metadata.create_all(bind=engine)
        
        # Get tables after creation
        new_tables = get_existing_tables()
        created_tables = [t for t in new_tables if t not in existing_tables]
        
        if created_tables:
            logger.info(f"✓ Created tables: {', '.join(created_tables)}")
        else:
            logger.info("✓ All tables already exist")
        
        # Log all current tables with column info
        logger.info("\nDatabase schema:")
        inspector = inspect(engine)
        for table_name in new_tables:
            columns = inspector.get_columns(table_name)
            logger.info(f"  {table_name}:")
            for col in columns:
                logger.info(f"    - {col['name']} ({col['type']})")
        
        return True
        
    except Exception as e:
        logger.error(f"✗ Failed to create tables: {str(e)}", exc_info=True)
        db.rollback()
        return False
    finally:
        db.close()


def verify_tables():
    """Verify all required tables exist."""
    logger.info("\nVerifying tables...")
    
    required_tables = ['users', 'detection_logs', 'market_prices', 'knowledge_base']
    existing_tables = get_existing_tables()
    missing_tables = [t for t in required_tables if t not in existing_tables]
    
    if missing_tables:
        logger.error(f"✗ Missing tables: {', '.join(missing_tables)}")
        return False
    else:
        logger.info(f"✓ All required tables exist: {', '.join(required_tables)}")
        return True


def insert_sample_data():
    """Insert sample data for testing (optional)."""
    logger.info("\nInserting sample data...")
    db = SessionLocal()
    
    try:
        # Check if knowledge base has data
        result = db.execute(text("SELECT COUNT(*) FROM knowledge_base"))
        count = result.fetchone()[0]
        
        if count > 0:
            logger.info(f"✓ Knowledge base already has {count} entries")
            return True
        
        # Insert sample knowledge base entries in transaction
        with db.begin():
            sample_data = [
                {
                    'title': 'Bệnh đốm trắng (White Spot Disease - WSD)',
                    'content': 'Bệnh đốm trắng là một trong những bệnh nguy hiểm nhất đối với tôm nuôi. Triệu chứng: xuất hiện các đốm trắng trên vỏ tôm, tôm ngừng ăn, bơi lờ đờ.',
                    'category': 'disease'
                },
                {
                    'title': 'Cách phòng bệnh cho tôm',
                    'content': 'Thường xuyên kiểm tra chất lượng nước, duy trì mật độ nuôi phù hợp, sử dụng thức ăn chất lượng, vệ sinh ao định kỳ.',
                    'category': 'prevention'
                },
                {
                    'title': 'Chăm sóc tôm sau khi phát hiện bệnh',
                    'content': 'Cách ly tôm bệnh ngay lập tức, tăng cường sục khí, giảm mật độ nuôi, kiểm tra và điều chỉnh các thông số nước.',
                    'category': 'treatment'
                }
            ]
            
            for data in sample_data:
                db.execute(text("""
                    INSERT INTO knowledge_base (title, content, category, is_active, created_at)
                    VALUES (:title, :content, :category, TRUE, NOW())
                """), data)
        
        logger.info(f"✓ Inserted {len(sample_data)} sample knowledge entries")
        return True
        
    except Exception as e:
        logger.error(f"✗ Failed to insert sample data: {str(e)}", exc_info=True)
        db.rollback()
        return False
    finally:
        db.close()


def init_db():
    """Main initialization process with comprehensive error handling."""
    logger.info("=" * 60)
    logger.info("DATABASE INITIALIZATION")
    logger.info("=" * 60)
    logger.info(f"App: {settings.APP_NAME} v{settings.APP_VERSION}")
    logger.info(f"Database: {settings.DATABASE_URL.split('@')[1] if '@' in settings.DATABASE_URL else 'Not configured'}")
    logger.info("=" * 60)
    
    try:
        # Step 1: Check connection
        if not check_database_connection():
            logger.error("\n❌ Initialization FAILED: Cannot connect to database")
            logger.error("Please check:")
            logger.error("  1. PostgreSQL is running")
            logger.error("  2. DATABASE_URL in .env is correct")
            logger.error("  3. Database exists and user has permissions")
            return False
        
        # Step 2: Create tables
        if not create_tables():
            logger.error("\n❌ Initialization FAILED: Cannot create tables")
            return False
        
        # Step 3: Verify tables
        if not verify_tables():
            logger.error("\n❌ Initialization FAILED: Missing required tables")
            return False
        
        # Step 4: Insert sample data (optional, can skip if fails)
        insert_sample_data()
        
        logger.info("\n" + "=" * 60)
        logger.info("✓ DATABASE INITIALIZATION COMPLETED SUCCESSFULLY")
        logger.info("=" * 60)
        logger.info("\nNext steps:")
        logger.info("  1. Start the API server: uvicorn main:app --reload")
        logger.info("  2. Test the API: http://localhost:8000/health/db")
        logger.info("  3. View API docs: http://localhost:8000/docs")
        
        return True
        
    except Exception as e:
        logger.error(f"\n❌ Unexpected error: {str(e)}", exc_info=True)
        return False


if __name__ == "__main__":
    try:
        success = init_db()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        logger.info("\n\nInitialization cancelled by user")
        sys.exit(1)
    except Exception as e:
        logger.error(f"\n❌ Fatal error: {str(e)}", exc_info=True)
        sys.exit(1)

