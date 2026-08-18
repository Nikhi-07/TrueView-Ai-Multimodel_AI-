"""
ConvNeXt-Tiny Multi-Task Dual-Head Model Architecture for TrueView AI.
Production Run 04 Checkpoint Integration.

Architecture:
1. Shared ConvNeXt-Tiny Backbone (torchvision.models.convnext_tiny)
2. Primary Binary Liveness Head (768 -> 2): [Real (0), Spoof (1)]
3. Auxiliary 5-Class Attack Classification Head (768 -> 5):
   [0: "real", 1: "print_attack", 2: "replay_attack", 3: "screen_attack", 4: "mask_attack"]
"""

import os
from typing import Optional, Tuple, Dict, Any, List
import torch
import torch.nn as nn
import torchvision.models as models


class ConvNeXtMultiTaskModel(nn.Module):
    """ConvNeXt-Tiny Multi-Task Dual-Head Model for Face Anti-Spoofing."""

    STANDARD_CLASSES: List[str] = ["real", "print_attack", "replay_attack", "screen_attack", "mask_attack"]

    def __init__(
        self,
        num_classes: int = 5,
        in_channels: int = 3,
        pretrained: bool = False
    ):
        super().__init__()
        self.num_classes = num_classes
        self.in_channels = in_channels

        # 1. ConvNeXt-Tiny backbone
        if pretrained:
            try:
                weights = models.ConvNeXt_Tiny_Weights.DEFAULT
                self.backbone = models.convnext_tiny(weights=weights)
            except Exception:
                self.backbone = models.convnext_tiny(weights=None)
        else:
            self.backbone = models.convnext_tiny(weights=None)

        # 2. Extract feature dimension (768) and replace default classification head
        in_features = self.backbone.classifier[2].in_features
        self.backbone.classifier[2] = nn.Identity()

        # 3. Dropout
        self.dropout = nn.Dropout(p=0.2)

        # 4. Primary Binary Liveness Head (0 = Real, 1 = Spoof)
        self.binary_head = nn.Linear(in_features, 2)

        # 5. Auxiliary 5-Class Attack Classification Head
        self.aux_head = nn.Linear(in_features, num_classes)

    def forward(self, x: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Forward pass returning (binary_logits, aux_logits).
        Args:
            x: Input tensor [B, 3, 224, 224]
        Returns:
            binary_logits: Tensor [B, 2]
            aux_logits: Tensor [B, 5]
        """
        feats = self.backbone(x)  # [B, 768]
        feats = self.dropout(feats)
        binary_logits = self.binary_head(feats)  # [B, 2]
        aux_logits = self.aux_head(feats)        # [B, 5]
        return binary_logits, aux_logits

    def extract_features(self, x: torch.Tensor) -> torch.Tensor:
        """Extracts 768-dim pooled feature embeddings."""
        if hasattr(self.backbone, "features") and hasattr(self.backbone, "avgpool"):
            feat = self.backbone.features(x)
            feat = self.backbone.avgpool(feat)
            return torch.flatten(feat, 1)
        return self.backbone(x)

    @classmethod
    def load_from_checkpoint(
        cls,
        checkpoint_path: str,
        device: torch.device,
        num_classes: int = 5
    ) -> "ConvNeXtMultiTaskModel":
        """
        Instantiates model and loads state_dict from checkpoint.
        Ensures strict 100% key matching.
        """
        if not os.path.exists(checkpoint_path):
            raise FileNotFoundError(f"Checkpoint file not found at: {checkpoint_path}")

        model = cls(num_classes=num_classes, pretrained=False)
        checkpoint = torch.load(checkpoint_path, map_location=device, weights_only=False)
        
        state_dict = checkpoint.get("model_state_dict", checkpoint)
        load_result = model.load_state_dict(state_dict, strict=True)
        
        if len(load_result.missing_keys) > 0 or len(load_result.unexpected_keys) > 0:
            raise ValueError(
                f"Checkpoint key mismatch: missing={load_result.missing_keys}, "
                f"unexpected={load_result.unexpected_keys}"
            )

        model.to(device)
        model.eval()
        return model
