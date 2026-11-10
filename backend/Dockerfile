# Build the Spring Boot application with the repository's Java 21 toolchain.
FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /workspace

# The Maven repository is a BuildKit cache mount: on a host that keeps its build cache
# (webdemo) libraries are downloaded once, not on every build.
COPY pom.xml ./
COPY src/ src/
RUN --mount=type=cache,target=/root/.m2 mvn -B -ntp -DskipTests package \
    && java -Djarmode=tools -jar target/kas-backend-0.1.0-SNAPSHOT.jar \
         extract --layers --launcher --destination target/extracted

# Small runtime image; the service runs without root privileges.
# The jar is unpacked in Spring Boot's layers, least-changing first, so a code change
# only replaces the small "application" layer and the ~70 MB of libraries stay cached
# (and are not uploaded again when the image is pushed).
FROM eclipse-temurin:21-jre-jammy
WORKDIR /app
RUN groupadd --system --gid 10001 kas \
    && useradd --system --uid 10001 --gid kas --home-dir /app kas \
    # Mount point of the persistent disk for uploaded images (KAS_MEDIA_LOCAL_DIR),
    # owned by the service user so it can write there.
    && mkdir -p /var/data/kas-media && chown -R 10001:10001 /var/data
COPY --from=build --chown=10001:10001 /workspace/target/extracted/dependencies/ ./
COPY --from=build --chown=10001:10001 /workspace/target/extracted/spring-boot-loader/ ./
COPY --from=build --chown=10001:10001 /workspace/target/extracted/snapshot-dependencies/ ./
COPY --from=build --chown=10001:10001 /workspace/target/extracted/application/ ./
USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75.0", "org.springframework.boot.loader.launch.JarLauncher"]
