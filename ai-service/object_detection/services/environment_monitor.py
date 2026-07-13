"""
Environment Monitor – TrueView AI

Analyzes active detections to profile the proctoring environment.
Evaluates:
  - Person Count: No Person, Single Person, Multiple Persons
  - Prohibited Items: Presence of cell phone, unauthorized book/tablets, or headphones.
"""

from ..utils.constants import PROHIBITED_CLASSES

class EnvironmentMonitor:
    """
    Analyzes list of detected labels to assert proctoring violations.
    """
    
    @staticmethod
    def monitor_environment(detections: list) -> dict:
        """
        Scan detections and generate environment safety metrics.
        
        Args:
            detections: List of current frame detections
            
        Returns:
            dict containing:
                "person_count": int,
                "person_status": str ("no_person" | "single_person" | "multiple_persons"),
                "phone_detected": bool,
                "laptop_detected": bool,
                "book_detected": bool,
                "monitor_detected": bool,
                "prohibited_items_count": int,
                "prohibited_items_list": list
        """
        person_count = 0
        phone_detected = False
        laptop_detected = False
        book_detected = False
        monitor_detected = False
        
        prohibited_items = []
        
        for det in detections:
            label = det["label"]
            
            if label == "person":
                person_count += 1
            elif label == "phone":
                phone_detected = True
                if label not in prohibited_items:
                    prohibited_items.append(label)
            elif label == "laptop":
                laptop_detected = True
            elif label == "book":
                book_detected = True
                if label not in prohibited_items:
                    prohibited_items.append(label)
            elif label == "monitor":
                monitor_detected = True
                
        # Determine person status
        if person_count == 0:
            person_status = "no_person"
        elif person_count == 1:
            person_status = "single_person"
        else:
            person_status = "multiple_persons"
            
        return {
            "person_count": person_count,
            "person_status": person_status,
            "phone_detected": phone_detected,
            "laptop_detected": laptop_detected,
            "book_detected": book_detected,
            "monitor_detected": monitor_detected,
            "prohibited_items_count": len(prohibited_items),
            "prohibited_items_list": prohibited_items
        }
