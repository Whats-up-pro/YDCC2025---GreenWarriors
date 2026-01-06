import 'package:flutter/material.dart';
import 'services/ai_service.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Green Warriors - Shrimp Disease Detection',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.green),
        useMaterial3: true,
      ),
      home: const MyHomePage(title: 'Shrimp Disease Detection'),
    );
  }
}

class MyHomePage extends StatefulWidget {
  const MyHomePage({super.key, required this.title});

  final String title;

  @override
  State<MyHomePage> createState() => _MyHomePageState();
}

class _MyHomePageState extends State<MyHomePage> {
  final AIService _aiService = AIService();
  bool _isInitializing = false;
  bool _isInitialized = false;
  String _statusMessage = 'AI Service not initialized';

  @override
  void initState() {
    super.initState();
    _initializeAI();
  }

  Future<void> _initializeAI() async {
    setState(() {
      _isInitializing = true;
      _statusMessage = 'Initializing AI Service...';
    });

    try {
      await _aiService.initialize();
      setState(() {
        _isInitialized = true;
        _isInitializing = false;
        _statusMessage = 'AI Service initialized successfully';
      });
    } catch (e) {
      setState(() {
        _isInitializing = false;
        _statusMessage = 'Failed to initialize AI Service: $e';
      });
    }
  }

  @override
  void dispose() {
    _aiService.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: Theme.of(context).colorScheme.inversePrimary,
        title: Text(widget.title),
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: <Widget>[
              Icon(
                _isInitialized
                    ? Icons.check_circle
                    : _isInitializing
                        ? Icons.hourglass_empty
                        : Icons.error,
                size: 64,
                color: _isInitialized
                    ? Colors.green
                    : _isInitializing
                        ? Colors.orange
                        : Colors.red,
              ),
              const SizedBox(height: 20),
              Text(
                _statusMessage,
                style: Theme.of(context).textTheme.titleMedium,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 40),
              if (_isInitializing)
                const CircularProgressIndicator()
              else if (!_isInitialized)
                ElevatedButton(
                  onPressed: _initializeAI,
                  child: const Text('Retry Initialization'),
                ),
              const SizedBox(height: 20),
              const Divider(),
              const SizedBox(height: 20),
              Text(
                'Usage Instructions:',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 10),
              const Text(
                '1. Place your yolov8n_shrimp.tflite model in assets/models/\n'
                '2. The AI service will load the model on startup\n'
                '3. Use aiService.detectObjects() to detect shrimp diseases\n'
                '4. Results include bounding boxes, labels, and confidence scores\n'
                '5. Only detections with >80% confidence are returned',
                textAlign: TextAlign.left,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
