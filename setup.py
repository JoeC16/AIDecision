from setuptools import setup, find_packages

setup(
    name="aidecision",
    version="0.1.0",
    description="AI decision audit infrastructure — EU AI Act compliant logging in 3 lines of code",
    long_description=open("README.md").read(),
    long_description_content_type="text/markdown",
    author="AiDecision",
    url="https://github.com/aidecision/sdk-python",
    packages=find_packages(exclude=["tests*"]),
    python_requires=">=3.9",
    install_requires=[
        # Zero hard dependencies — works with whatever AI SDK the customer already has
    ],
    extras_require={
        "openai": ["openai>=1.0.0"],
        "anthropic": ["anthropic>=0.20.0"],
        "dev": [
            "pytest>=7.0",
            "pytest-asyncio",
            "openai>=1.0.0",
            "anthropic>=0.20.0",
        ],
    },
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Intended Audience :: Developers",
        "Topic :: Software Development :: Libraries",
        "Topic :: Security",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
    ],
    keywords="ai audit compliance eu-ai-act logging openai anthropic",
)
