# Build the Spring Boot application with the repository's Java 21 toolchain.
FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /workspace

COPY pom.xml ./
COPY src/ src/
RUN mvn -B -ntp -DskipTests package

# Small runtime image; the service runs without root privileges.
FROM eclipse-temurin:21-jre-jammy
WORKDIR /app
RUN groupadd --system --gid 10001 kas \
    && useradd --system --uid 10001 --gid kas --home-dir /app kas \
    # Mount point of the Render persistent disk for uploaded images (KAS_MEDIA_LOCAL_DIR),
    # owned by the service user so it can write there.
    && mkdir -p /var/data/kas-media && chown -R 10001:10001 /var/data
COPY --from=build --chown=10001:10001 \
    /workspace/target/kas-backend-0.1.0-SNAPSHOT.jar /app/app.jar
USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75.0", "-jar", "/app/app.jar"]
